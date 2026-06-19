// Repair files whose bytes are UTF-8-encoded Latin-1 mojibake (the classic
// "double-encoded UTF-8" symptom: e.g. "—" → "â€"" on disk).
//
// Algorithm: read file bytes → interpret as Latin-1 (so each byte maps 1:1 to
// a code point) → re-encode as UTF-8. The result restores the original
// Unicode characters as proper UTF-8 bytes.
//
// Safety: only touches files that contain a mojibake signature byte sequence.
// Backs up each repaired file to <name>.bak.utf8 once.
//
// Usage: node scripts/fix-mojibake.mjs <file...>

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SIGNATURES = [
  "â€",     // — – " ' ' etc.
  "ðŸ",     // 4-byte emoji
  "Â ",     // nbsp
  "Â·",     // ·
  "Â©",     // ©
  "Â®",     // ®
];

function isMojibake(bytes) {
  // Check UTF-8-decoded string for signatures
  let asUtf8;
  try {
    asUtf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return false;
  }
  return SIGNATURES.some((sig) => asUtf8.includes(sig));
}

function fixFile(path) {
  const abs = resolve(path);
  const bytes = readFileSync(abs);
  if (!isMojibake(bytes)) {
    console.log(`SKIP  ${path} (no mojibake signature)`);
    return false;
  }
  // Decode bytes as Latin-1 (1 byte = 1 code point), then re-encode as UTF-8.
  const repaired = Buffer.from(
    new TextDecoder("latin1").decode(bytes),
    "utf-8",
  );
  const backup = `${abs}.bak.utf8`;
  if (!existsSync(backup)) {
    writeFileSync(backup, bytes);
  }
  writeFileSync(abs, repaired);
  console.log(`FIXED ${path} (${bytes.length} → ${repaired.length} bytes)`);
  return true;
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("Usage: node scripts/fix-mojibake.mjs <file...>");
  process.exit(1);
}

let fixed = 0;
for (const t of targets) {
  if (fixFile(t)) fixed++;
}
console.log(`Done. Repaired ${fixed} file(s).`);