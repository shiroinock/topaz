// Phase 1.5-6 prep #13: node:fs.readFileSync(path: string, "utf8"): string.
// Loader accepts `node:fs` as a stdlib specifier and codegen recognizes
// `readFileSync(...)` at call sites only — the identifier itself has no
// runtime binding, mirroring the `String.fromCharCode` shortcut from prep #12.

import { readFileSync } from "node:fs";

// --- basic: read fixture via relative path (smoke.sh runs from repo root) ---
const text: string = readFileSync("examples/fixtures/node_fs_sample.txt", "utf8");
// Fixture is exactly `hello topaz\n` (12 bytes including the trailing LF).
// console.log adds its own newline, so the text line is followed by a blank
// line in the captured output.
console.log(text);

// --- byte length matches the on-disk size (UTF-8 == ASCII for this file) ---
console.log(text.length);

// --- charCodeAt round-trips with the file's first byte ---
console.log(text.charCodeAt(0)); // 104 = 'h'

// --- slice cuts a substring (prep #10 string method) ---
console.log(text.slice(0, 5));   // hello

// --- call-site path argument can be a variable / function param ---
function readUtf8(p: string): string {
  return readFileSync(p, "utf8");
}
console.log(readUtf8("examples/fixtures/node_fs_sample.txt").length);

// --- chaining: read + slice + concat with literals ---
const head: string = readFileSync("examples/fixtures/node_fs_sample.txt", "utf8").slice(0, 5);
console.log("[" + head + "]");

// --- template-literal interpolation works because the result is `string` ---
console.log(`first5=${head}`);

// --- `===` byte-compares against a literal ---
console.log(head === "hello");
