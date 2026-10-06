import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../src', import.meta.url));
const HOOK_RE = /\buse(?:State|Effect|LayoutEffect|Memo|Callback|Ref|Context|Reducer|SyncExternalStore|InsertionEffect|ImperativeHandle|DebugValue)\s*\(/;
const CUSTOM_HOOK_RE = /\buse[A-Z][a-zA-Z0-9_]*\s*\(/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx|tsx|js|ts)$/.test(name)) out.push(p);
  }
  return out;
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function auditFile(path) {
  const raw = readFileSync(path, 'utf8');
  const code = stripComments(raw);
  const issues = [];

  const fnRe = /export\s+default\s+function\s+(\w+)|function\s+(\w+)\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = fnRe.exec(code))) {
    const name = m[1] || m[2];
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    let body = '';
    while (i < code.length && depth > 0) {
      const ch = code[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      if (depth > 0) body += ch;
      i += 1;
    }
    if (!HOOK_RE.test(body) && !CUSTOM_HOOK_RE.test(body)) continue;

    const lines = body.split('\n');
    let seenEarlyReturn = false;
    let lineNo = code.slice(0, start).split('\n').length;
    let hookCallsBeforeReturn = 0;
    for (const line of lines) {
      lineNo += 1;
      const trimmed = line.trim();
      const isHookLine = HOOK_RE.test(line) || /^\s*const\s+\w+\s*=\s*use[A-Z]/.test(line);
      if (isHookLine) hookCallsBeforeReturn += 1;
      if (/^return(\s|<|\();/.test(trimmed) || /^return\s*$/.test(trimmed)) {
        if (!trimmed.includes('=>') && !trimmed.startsWith('return ()')) {
          seenEarlyReturn = true;
        }
      }
      if (seenEarlyReturn && isHookLine) {
        issues.push({ name, lineNo, line: trimmed.slice(0, 120), hooksBefore: hookCallsBeforeReturn });
        seenEarlyReturn = false;
      }
    }
  }
  return issues;
}

const files = walk(ROOT);
const all = [];
for (const f of files) {
  const issues = auditFile(f);
  if (issues.length) all.push({ file: relative(join(ROOT, '..'), f), issues });
}

if (!all.length) {
  console.log('No early-return-before-hook patterns detected (heuristic).');
} else {
  for (const entry of all) {
    console.log('\n' + entry.file);
    for (const i of entry.issues) console.log(`  ${i.name} ~${i.lineNo}: ${i.line}`);
  }
}
