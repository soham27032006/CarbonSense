// Replace mojibake patterns in source files. The disk file is valid UTF-8;
// each visible mojibake string is a real sequence of Unicode characters that
// we re-decode to recover the original Unicode character.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Most emojis only have one or two likely candidates for a given mojibake.
// Build a quick lookup: bytes_after_ðŸ_as_cp_pair → emoji.

// Windows-1252 mapping for high code points that often appear in mojibake.
const W1252 = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

// Reverse map: byte value → typical code point seen in mojibake.
const BYTE_TO_CP = Object.fromEntries(
  Object.entries(W1252).map(([cp, b]) => [b, Number(cp)]),
);
// Bytes 0x80-0xFF in Latin-1 are the same as code points U+0080-U+00FF.
for (let b = 0x80; b <= 0xff; b++) {
  if (!(b in BYTE_TO_CP)) BYTE_TO_CP[b] = b;
}

function decodeEmojiPair(s) {
  return s.replace(/ðŸ(.)(.)/g, (m, c1, c2) => {
    const cp1 = c1.codePointAt(0);
    const cp2 = c2.codePointAt(0);
    const b3 = BYTE_TO_CP[cp1 & 0xff] === cp1
      ? (cp1 & 0xff)
      : (W1252[cp1] ?? (cp1 & 0xff));
    const b4 = BYTE_TO_CP[cp2 & 0xff] === cp2
      ? (cp2 & 0xff)
      : (W1252[cp2] ?? (cp2 & 0xff));
    const bytes = Buffer.from([0xf0, 0x9f, b3, b4]);
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      // JS strings store emoji as surrogate pairs (.length === 2).
      // Accept any non-ASCII decoded character.
      if ([...decoded].length === 1 && decoded.codePointAt(0) >= 0x80) {
        return decoded;
      }
    } catch {
      // not valid
    }
    return m;
  });
}

// Catch stray ✈ U+2708 (3-byte UTF-8: e2 9c 88) that got double-encoded as
// "âœˆ" plus a VS16 + ZWJ ("ï¸" → e2 80 8d as code point → ‍).
// "âœˆï¸Â" → "✈️"
function decodeAirplane(s) {
  return s
    .replace(/âœˆï¸Â/g, "✈️")
    .replace(/âœˆï¸â€¹/g, "✈️")
    .replace(/âœË†Ã¯Â¸Â/g, "✈️")
    .replace(/âœˆÃ¯Â¸Â/g, "✈️")
    .replace(/âœˆï¸â€°/g, "✈️")
    .replace(/âœˆï¸Æ’/g, "✈️")
    .replace(/âœË†Ã¯Â¸â€°/g, "✈️")
    .replace(/âœˆÃ¯Â¸Æ’/g, "✈️");
}

const TABLE = [
  ["â€™", "’"],
  ["â€˜", "‘"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€¦", "…"],
  ["â€“", "–"],
  ["â€”", "—"],
  ["â€¢", "•"],
  ["â€¡", "‡"],
  ["â€°", "‰"],
  ["â€¹", "‹"],
  ["â€º", "›"],
  ["Ã¡", "á"],
  ["Ã¢", "â"],
  ["Ã£", "ã"],
  ["Ã¤", "ä"],
  ["Ã¥", "å"],
  ["Ã¦", "æ"],
  ["Ã§", "ç"],
  ["Ã¨", "è"],
  ["Ã©", "é"],
  ["Ãª", "ê"],
  ["Ã«", "ë"],
  ["Ã¬", "ì"],
  ["Ã­", "í"],
  ["Ã®", "î"],
  ["Ã¯", "ï"],
  ["Ã°", "ð"],
  ["Ã±", "ñ"],
  ["Ã²", "ò"],
  ["Ã³", "ó"],
  ["Ã´", "ô"],
  ["Ãµ", "õ"],
  ["Ã¶", "ö"],
  ["Ã¸", "ø"],
  ["Ã¹", "ù"],
  ["Ãº", "ú"],
  ["Ã»", "û"],
  ["Ã¼", "ü"],
  ["Ã½", "ý"],
  ["Ã¾", "þ"],
  ["Ã¿", "ÿ"],
  ["Â·", "·"],
  ["Â ", " "],
  ["Â©", "©"],
  ["Â®", "®"],
  ["Â¡", "¡"],
  ["Â¢", "¢"],
  ["Â£", "£"],
  ["Â¤", "¤"],
  ["Â¥", "¥"],
  ["Â¦", "¦"],
  ["Â§", "§"],
  ["Â¨", "¨"],
  ["Â«", "«"],
  ["Â»", "»"],
  ["Â¿", "¿"],
];

function fixFile(path) {
  const abs = resolve(path);
  const bytes = readFileSync(abs);
  let text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

  let changed = false;
  const apply = (newText) => {
    if (newText !== text) {
      changed = true;
      text = newText;
    }
  };

  apply(decodeAirplane(text));
  apply(decodeEmojiPair(text));
  for (const [bad, good] of TABLE) {
    if (text.includes(bad)) {
      apply(text.split(bad).join(good));
    }
  }
  apply(decodeEmojiPair(text));
  apply(decodeAirplane(text));

  if (!changed) {
    console.log(`SKIP  ${path} (clean)`);
    return false;
  }

  const backup = `${abs}.bak.utf8`;
  if (!existsSync(backup)) writeFileSync(backup, bytes);
  const out = Buffer.from(text, "utf-8");
  writeFileSync(abs, out);
  console.log(`FIXED ${path} (${bytes.length} → ${out.length} bytes)`);
  return true;
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("Usage: node scripts/replace-mojibake.mjs <file...>");
  process.exit(1);
}

let fixed = 0;
for (const t of targets) {
  if (fixFile(t)) fixed++;
}
console.log(`Done. Repaired ${fixed} file(s).`);