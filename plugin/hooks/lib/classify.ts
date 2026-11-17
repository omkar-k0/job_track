// What kind of tool call is this, and what does the element it targets say?

import { labelForRef } from './transcript.ts';
import type { ToolInput, ToolStep } from './types.ts';

export type BrowserAction = 'click' | 'type' | 'input' | 'js' | 'key' | 'other';

export function splitToolName(name: unknown): { server: string; short: string } {
  const parts = String(name || '').split('__');
  if (parts[0] !== 'mcp' || parts.length < 3) return { server: '', short: String(name || '') };
  return { server: parts.slice(1, -1).join('__'), short: parts[parts.length - 1]! }; // length >= 3
}

export const isMail = (server: string) => /gmail|outlook|e-?mail|(^|_)mail/i.test(server);
export const isLinkedIn = (server: string) => /linkedin/i.test(server);
export const isBrowser = (server: string) => /chrome|browser|playwright|puppeteer|computer/i.test(server);
export const isTracker = (server: string) => /tracker|job.?hunt/i.test(server);

const SEND_TOOL = /^(send|send_.+|.+_send|reply|reply_all|reply_to_.+|forward|forward_.+|send_draft|create_and_send.*|submit_message|post_message|connect|connect_with.*|invite|invite_.+|send_invitation|send_connection_request|send_inmail|message_.+)$/i;

export function isSendTool(server: string, short: string): boolean {
  return (isMail(server) || isLinkedIn(server)) && SEND_TOOL.test(short);
}

export function isDraftWrite(server: string, short: string): boolean {
  return isMail(server) && /^(create_draft|update_draft|draft_.+|.+_draft)$/i.test(short) && !/^(get|list|delete|search)_/i.test(short);
}

export function draftBody(input: ToolInput): string {
  return [input.body, input.content, input.message, input.text, input.htmlBody, input.html_body, input.plain_text]
    .filter((v) => typeof v === 'string')
    .join('\n\n');
}

// ---------- browser ----------

export function browserAction(short: string, input: ToolInput): BrowserAction {
  const s = short.toLowerCase();
  const action = String(input.action || '').toLowerCase();
  if (/^(click|browser_click|left_click|double_click|triple_click|tap)$/.test(s)) return 'click';
  if (s === 'computer' && /click/.test(action)) return 'click';
  if (s === 'computer' && action === 'type') return 'type';
  if (s === 'computer' && action === 'key') return 'key';
  if (/^(key|press_key|browser_press_key|browser_press|keyboard_press)$/.test(s)) return 'key';
  if (/^(form_input|browser_type|fill|fill_form|browser_fill_form|type|set_value|select_option|browser_select_option)$/.test(s)) return 'input';
  if (/^(javascript_tool|javascript_exec|browser_evaluate|evaluate|execute_script|run_javascript|browser_exec)$/.test(s)) return 'js';
  if (s === 'browser_console') return input.expression ? 'js' : 'other'; // Hermes: reading console output is harmless
  return 'other';
}

// The keys a key-press tool will send: computer's text, Playwright's key, Hermes' key; any of them may be an array.
export function keyText(input: ToolInput): string {
  return [input.text, input.key, input.keys].flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v) => typeof v === 'string').join(' ');
}

// Cmd/Ctrl+Enter sends an open Gmail compose window. Tools spell the modifier and the key many ways
// (ControlOrMeta, CmdOrCtrl, NumpadEnter, KP_Enter), so modifiers may carry trailing word characters.
const MOD = String.raw`\b(?:cmd|command|meta|ctrl|control|super)\w*`;
const ENTER = String.raw`\b(?:numpad|kp_)?(?:enter|return)\b`;
export const SEND_KEYS = new RegExp(`${MOD}.*${ENTER}|${ENTER}.*${MOD}`, 'i');

// Tools and computer actions that only look at a page. A list of reads rather than of actions, so an
// unknown tool counts as acting.
const READ_ONLY_TOOL = /^(read_page|get_page_text|find|tabs_context(?:_mcp)?|tabs_create(?:_mcp)?|read_console_messages|read_network_requests|resize_window|gif_creator|screenshot|browser_snapshot|browser_take_screenshot|browser_console_messages|browser_network_requests|browser_tabs|browser_wait_for|browser_resize|browser_vision|browser_get_images)$/;
const READ_ONLY_ACTION = /^(screenshot|zoom|wait|scroll|scroll_to|cursor_position)$/;

export function onlyReads(short: string, input: ToolInput): boolean {
  const s = short.toLowerCase();
  if (s === 'computer') return READ_ONLY_ACTION.test(String(input.action || '').toLowerCase());
  if (s === 'browser_console') return !input.expression;
  return READ_ONLY_TOOL.test(s);
}

// The accessible name inside a line like `button "Submit application" [ref_45]`.
export function accessibleName(label: string | null): string | null {
  if (!label) return null;
  const m = label.match(/"([^"]{1,300})"|'([^']{1,300})'/);
  return (m ? (m[1] || m[2])! : label).trim(); // One of the two groups matched.
}

export function resolveLabel(input: ToolInput, steps: ToolStep[]): string | null {
  const direct = input.element || input.label || input.name || input.selector;
  if (typeof direct === 'string' && direct.trim()) return direct;
  const ref = input.ref || input.element_ref || input.target;
  if (typeof ref === 'string') return labelForRef(steps, ref.replace(/^@/, '')); // Hermes refs are "@e5", printed "[ref=e5]"
  return null;
}

// German forms. `\b` is ASCII-only in a non-`u` regex, so a boundary next to ä, ö, ü or ß is spelled out
// with these lookarounds, and each umlaut also matches its transliteration (ae, oe, ue, ss) and the bare vowel.
// Personal and consent stems carry no right boundary because German joins nouns (Datenschutzeinwilligung).
const NOT_AFTER_LETTER = '(?<![a-z\u00e4\u00f6\u00fc\u00df])';
const NOT_BEFORE_LETTER = '(?![a-z\u00e4\u00f6\u00fc\u00df])';
const de = (body: string, rightEdge = false) => `${NOT_AFTER_LETTER}(?:${body})${rightEdge ? NOT_BEFORE_LETTER : ''}`;
const AE = '(?:\u00e4|ae?)';
const OE = '(?:\u00f6|oe?)';
const UE = '(?:\u00fc|ue?)';
const SS = '(?:\u00df|ss)';

const SUBMIT_EN = /\b(submit|send application|apply now|easy apply|apply for (?:this )?(?:job|role|position)|complete (?:my )?application|finish (?:my )?application|confirm (?:and )?(?:submit|apply)|send my application)\b|^apply$/i;
// Mirrors the English list: "Absenden" is "Submit", "Jetzt bewerben" is "Apply now", a bare "Bewerben" is "Apply".
const SUBMIT_DE = `${de(`bewerbung\\s+(?:absenden|abschicken|einreichen|senden|verschicken|abschlie${SS}en)|jetzt\\s+bewerben|einfach\\s+bewerben|schnellbewerbung|absenden|abschicken`, true)}|^bewerben$`;
export const SUBMIT = new RegExp(`${SUBMIT_EN.source}|${SUBMIT_DE}`, 'i');
export const SEND = /^(send|send message|send now|send reply|send email|send invitation|send invite|send inmail|connect|reply)$/i;
export const DELETE = /\b(delete|remove|trash|discard|archive|bulk delete|clear (?:all|selected))\b/i;
export const CONFIRM = /\b(confirm|yes|ok|okay|delete|remove|continue)\b/i;
const PERSONAL_EN = /\b(passport|nationality|citizenship|date of birth|birth ?date|dob|age|marital|gender|sex|pronouns?|national id|id (?:number|card)|identity (?:card|number|document)|pesel|ssn|social security|national insurance|tax (?:id|number)|race|ethnicity|ethnic|religion|disabilit(?:y|ies)|veteran)\b/i;
const PERSONAL_DE = [
  de('geburts(?:datum|ort|tag|jahr|name)'),
  de(`staatsangeh${OE}rigkeit`),
  de(`nationalit${AE}t`),
  de('familienstand'),
  de('geschlecht'),
  de('anrede'),
  de(`konfession|religions?zugeh${OE}rigkeit`),
  de('(?:schwer)?behinder'),
  de('steuer(?:-|\\s)?(?:id|identifikationsnummer|nummer|nr)'),
  de('sozialversicherungs(?:nummer|ausweis)|sv(?:-|\\s)?nummer|rentenversicherungsnummer'),
  de('matrikel(?:nummer|nr)'),
  de('(?:personal)?ausweis|reisepass'),
].join('|');
export const PERSONAL = new RegExp(`${PERSONAL_EN.source}|${PERSONAL_DE}`, 'i');
export const PERSONAL_OPTION = /^(male|female|man|woman|non-binary|nonbinary|married|single|divorced|widowed|in a relationship|m\u00e4nnlich|maennlich|weiblich|divers|verheiratet|ledig|geschieden|verwitwet|herr|frau)$/i;
const CONSENT_EN = /\b(consent|i agree to (?:the )?record|record(?:ing)? (?:of )?(?:the |this |my )?(?:interview|call|conversation)|marketing|newsletter|talent (?:pool|community|network)|future (?:opportunities|roles|positions|openings|vacancies)|retain (?:my|your)|keep (?:my|your) (?:data|information|details|cv|resume|application)|share (?:my|your) (?:data|profile|information) with)\b/i;
// The same consents in German. Like the English list it does not match a bare privacy-policy or terms
// acknowledgement (Datenschutzerklärung, AGB, "Ich stimme zu"): those match only together with one of these.
const CONSENT_DE = [
  'einwillig', // Einwilligung, einwilligen, Datenschutzeinwilligung
  de('(?:ich\\s+)?willige\\s+(?:\\S+\\s+){0,6}?ein'),
  'zustimmung', // the noun is "consent"; Datenschutzzustimmung
  `(?:aufzeichnung|aufnahme|mitschnitt)\\w*\\s+(?:de[sr]\\s+|dieses\\s+|meines\\s+|eines\\s+)?(?:video-?)?(?:gespr${AE}ch|interview|telefonat|anruf|call)`,
  `(?:gespr${AE}ch|interview|telefonat)\\w*\\s+(?:\\S+\\s+){0,3}?aufgezeichnet`,
  'marketing',
  de('werb(?:ung|lich|e-?mail)'), // not inside "Bewerbung"
  'newsletter',
  `talent(?:-|\\s)?(?:pool|netzwerk|community|network)|(?:bewerber|kandidaten)pool`,
  de(`(?:zuk${UE}nftig|k${UE}nftig)e[nrs]?\\s+(?:stellen|positionen|vakanzen|jobs?|vacancies|m${OE}glichkeiten|karriere)`),
  `(?:speicherung|aufbewahrung|weitergabe|${UE}bermittlung)\\s+(?:meiner|ihrer|deiner)\\s+(?:daten|unterlagen|bewerbungsunterlagen|angaben|informationen|bewerbung)`,
  `(?:meine|ihre|deine)\\s+(?:daten|unterlagen|bewerbungsunterlagen|angaben|informationen|bewerbung)\\s+(?:\\S+\\s+){0,8}?(?:speicher|aufbewahr|aufheben|weiterzugeben|weitergeben|weitergegeben|${UE}bermitt)`,
].join('|');
export const CONSENT = new RegExp(`${CONSENT_EN.source}|${CONSENT_DE}`, 'i');
const DECLINE = /^(no|decline|i do not consent|i don't consent|do not|don't|opt out|no thanks|not now)\b/i;

export const truthy = (v: unknown) => v === true || /^(true|yes|on|checked|1|y|i agree|agree|accept|ja|ich stimme zu|stimme zu|zustimmen|akzeptieren|akzeptiert|einverstanden|ich bin einverstanden)$/i.test(String(v ?? '').trim());
export const isDecline = (name: string | null | undefined) => DECLINE.test(String(name || '').trim());

export const ATS_HOST = /(^|\.)(ashbyhq\.com|greenhouse\.io|lever\.co|workable\.com|teamtailor\.com|personio\.(?:de|com)|join\.com|myworkdayjobs\.com|smartrecruiters\.com|recruitee\.com|bamboohr\.com|breezy\.hr|jobvite\.com|icims\.com|typeform\.com|tally\.so)$/i;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function jsIntent(code: unknown): 'guard' | 'submit' | 'delete' | 'personal' | 'other' {
  const s = String(code || '');
  const clicks = /\.click\s*\(|dispatchEvent\s*\(|\.submit\s*\(|requestSubmit\s*\(/.test(s);
  if (/\.(submit|requestSubmit)\s*\(/.test(s)) return 'submit';
  if (clicks && /submit|apply|send/i.test(s)) return 'submit';
  if (clicks && /delete|trash|remove|discard/i.test(s)) return 'delete';
  if (/(\.value\s*=|\.checked\s*=|setAttribute\(\s*['"]checked)/.test(s) && (PERSONAL.test(s) || CONSENT.test(s))) return 'personal';
  if (/JOBHUNT_TRIAGE_GUARD/.test(s)) return 'guard';
  return 'other';
}
