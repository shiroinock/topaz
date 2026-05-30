// Phase 1.5-6 prep #19: node:fs.writeFileSync(path: string, content: string): void.
// Same call-site-shortcut path as readFileSync (prep #13) / existsSync (prep #17).
// Encoding is implicit utf8 (the third options arg is unsupported in this dialect).
// The call types as void: it can appear as a statement but cannot be used as a value.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

// --- basic: write then read back ---
writeFileSync("/tmp/topaz_write_file_test.txt", "hello topaz write\n");
console.log(existsSync("/tmp/topaz_write_file_test.txt")); // true
console.log(readFileSync("/tmp/topaz_write_file_test.txt", "utf8")); // hello topaz write\n + console.log's \n

// --- truncates an existing file (matches Node's default behaviour) ---
writeFileSync("/tmp/topaz_write_file_test.txt", "shorter");
console.log(readFileSync("/tmp/topaz_write_file_test.txt", "utf8")); // shorter

// --- empty content writes a zero-byte file ---
writeFileSync("/tmp/topaz_write_file_test.txt", "");
console.log(readFileSync("/tmp/topaz_write_file_test.txt", "utf8").length); // 0

// --- both args can be variables / function params ---
function dump(p: string, body: string): void {
  writeFileSync(p, body);
}
dump("/tmp/topaz_write_file_test.txt", "via fn\n");
console.log(readFileSync("/tmp/topaz_write_file_test.txt", "utf8")); // via fn\n + \n

// --- content can be the result of string operations (template / slice / concat) ---
const name: string = "topaz";
writeFileSync("/tmp/topaz_write_file_test.txt", `hello ${name}!`);
console.log(readFileSync("/tmp/topaz_write_file_test.txt", "utf8")); // hello topaz!
