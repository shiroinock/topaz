// Phase 1.5-6 prep #17: node:fs.existsSync(path: string): boolean.
// Same syntactic-shortcut path as readFileSync (prep #13) — the loader accepts
// `node:fs` as a stdlib specifier and codegen recognizes `existsSync(...)` at
// call sites only. The result is a strict boolean, so it can drive an `if`.

import { existsSync } from "node:fs";

// --- existing file -> true (smoke.sh runs from repo root) ---
console.log(existsSync("examples/fixtures/node_fs_sample.txt")); // true

// --- missing file -> false ---
console.log(existsSync("examples/fixtures/does_not_exist.txt")); // false

// --- directories count as existing too (access F_OK, matches Node) ---
console.log(existsSync("examples/fixtures")); // true

// --- result is a real boolean: usable as a strict `if` condition ---
if (existsSync("examples/fixtures/node_fs_sample.txt")) {
  console.log("found");
} else {
  console.log("missing");
}

// --- call-site path can be a variable / function param ---
function present(p: string): boolean {
  return existsSync(p);
}
const path: string = "examples/fixtures/node_fs_sample.txt";
console.log(present(path));            // true
console.log(present("/no/such/path")); // false

// --- combines with `!` and `&&` (boolean operators) ---
console.log(!existsSync("/no/such/path"));                       // true
console.log(existsSync(path) && !existsSync("/no/such/path"));   // true
