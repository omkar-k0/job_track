// Where the plugin keeps its data. Shared by the tracker and the hooks, so both always agree.
//
// The plugin was called job-tracker and kept its data in ~/.job-tracker with JOB_TRACKER_* variables. Old
// names still work, and an existing ~/.job-tracker is used until the user moves it: the data is personal and
// the folder may be open elsewhere, so it is never moved automatically.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let warned = false;

export function env(name: 'HOME' | 'DB' | 'NODE'): string | undefined {
  return process.env[`LAUFBAHN_${name}`] || process.env[`JOB_TRACKER_${name}`] || undefined;
}

export function laufbahnHome(): string {
  const set = env('HOME');
  if (set) return set;
  const home = join(homedir(), '.laufbahn');
  const legacy = join(homedir(), '.job-tracker');
  if (existsSync(home) || !existsSync(legacy)) return home;
  if (!warned) {
    warned = true;
    // stderr only: stdout is the MCP protocol and the hook reply.
    process.stderr.write(`[laufbahn] Using the old data folder ${legacy}. To move it, quit Claude and run: mv "${legacy}" "${home}"\n`);
  }
  return legacy;
}
