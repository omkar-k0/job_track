// export_data: a copy of the tracker's main tables as JSON (one file, for backups) or CSV (one file per table,
// for spreadsheets), written owner-only under exports/ next to the tracker database. Read-only on the database.

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { SQLOutputValue } from 'node:sqlite';
import { readTx, SCHEMA_VERSION } from './db.ts';
import { ToolError } from './errors.ts';
import { secureDir, secureFile } from './fsperm.ts';
import type { ArgsFor } from './tools.ts';
import type { Tracker } from './tracker.ts';
import { isRecord, oneOf } from './util.ts';

export const EXPORT_TABLES = ['roles', 'companies', 'events', 'interviews'] as const;
export const EXPORT_FORMATS = ['json', 'csv'] as const;
type ExportTable = (typeof EXPORT_TABLES)[number];
type Row = Record<string, SQLOutputValue>;

// A file name stem, not a path: no separators, no dots, so nothing can land outside exports/.
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

// Spreadsheets run a cell that starts with one of these as a formula. Employer text is not ours to trust.
const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(v: SQLOutputValue): string {
  if (v === null) return '';
  let s = v instanceof Uint8Array ? Buffer.from(v).toString('base64') : String(v);
  if (typeof v === 'string' && FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Row[]): string {
  const lines = [columns.map(csvCell).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c] ?? null)).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

function errnoCode(e: unknown): string | null {
  return isRecord(e) && typeof e.code === 'string' ? e.code : null;
}

// 'wx' refuses an existing file (or a symlink planted in its place) instead of writing through it.
function writeNew(path: string, data: string): void {
  try {
    writeFileSync(path, data, { mode: 0o600, flag: 'wx' });
    secureFile(path);
  } catch (e) {
    const code = errnoCode(e);
    if (code === 'EEXIST') throw new ToolError(`${path} already exists. Pass another name, or omit name for a timestamped one.`);
    if (code) throw new ToolError(`Cannot write ${path} (${code}). Check that the tracker folder is writable.`);
    throw e;
  }
}

export function exportData(t: Tracker, { format, tables, name }: ArgsFor<'export_data'>) {
  if (!oneOf(EXPORT_FORMATS, format)) throw new ToolError(`format must be ${EXPORT_FORMATS.join(' or ')}, got "${format}".`);
  const chosen: ExportTable[] = [];
  for (const table of tables ?? EXPORT_TABLES) {
    if (!oneOf(EXPORT_TABLES, table)) throw new ToolError(`Unknown table "${table}". Known: ${EXPORT_TABLES.join(', ')}.`);
    if (!chosen.includes(table)) chosen.push(table);
  }
  if (!chosen.length) throw new ToolError(`tables must name at least one of ${EXPORT_TABLES.join(', ')}, or be omitted for all.`);
  if (name != null && !NAME.test(name)) throw new ToolError('name must be 1 to 64 letters, digits, - or _, starting with a letter or digit (a file name stem, no path or extension).');
  if (!t.dbPath || t.dbPath === ':memory:') throw new ToolError('This tracker runs in memory, so there is no tracker folder to export into.');

  const exported_at = new Date().toISOString();
  const stem = name ?? `job-tracker-${exported_at.replace(/[:.]/g, '-')}`;
  const dir = join(dirname(resolve(t.dbPath)), 'exports');
  // One read transaction, so the tables agree with each other even while another session writes.
  // Table names come from EXPORT_TABLES only, never from the caller's text.
  const data = readTx(t.db, () =>
    chosen.map((table) => ({
      table,
      columns: t.q<{ name: string }>(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).map((c) => c.name),
      rows: t.q<Row>(`SELECT * FROM ${table} ORDER BY id`),
    })),
  );
  const counts = Object.fromEntries(data.map((d) => [d.table, d.rows.length]));
  try {
    secureDir(dir);
  } catch (e) {
    const code = errnoCode(e);
    if (code) throw new ToolError(`Cannot create ${dir} (${code}). Check that the tracker folder is writable.`);
    throw e;
  }

  const files: { table: ExportTable | 'all'; path: string; rows: number }[] = [];
  if (format === 'json') {
    const path = join(dir, `${stem}.json`);
    const body = { exported_at, schema_version: SCHEMA_VERSION, tables: Object.fromEntries(data.map((d) => [d.table, d.rows])) };
    writeNew(path, `${JSON.stringify(body, (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString('base64') : v), 2)}\n`);
    files.push({ table: 'all', path, rows: data.reduce((n, d) => n + d.rows.length, 0) });
  } else {
    for (const d of data) {
      const path = join(dir, `${stem}-${d.table}.csv`);
      writeNew(path, toCsv(d.columns, d.rows));
      files.push({ table: d.table, path, rows: d.rows.length });
    }
  }
  return { format, dir, path: files.length === 1 ? files[0]?.path : undefined, files, counts, exported_at };
}
