// Phase 1.5-6 prep #20: node:fs.mkdirSync(path: string, { recursive: true }): void.
// Recursive-only — the options literal is fixed to `{ recursive: true }` so the
// call always behaves like `mkdir -p`. Same call-site-shortcut path as
// readFileSync (prep #13) / existsSync (prep #17) / writeFileSync (prep #19).
// Returns void: it can appear as a statement but cannot be used as a value.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

// --- basic: create a nested directory tree from scratch ---
mkdirSync("/tmp/topaz_mkdir_test/a/b/c", { recursive: true });
console.log(existsSync("/tmp/topaz_mkdir_test/a/b/c")); // true
console.log(existsSync("/tmp/topaz_mkdir_test/a/b")); // true (intermediate)
console.log(existsSync("/tmp/topaz_mkdir_test/a")); // true (intermediate)

// --- idempotent: a second call against an existing tree is a no-op ---
mkdirSync("/tmp/topaz_mkdir_test/a/b/c", { recursive: true });
console.log(existsSync("/tmp/topaz_mkdir_test/a/b/c")); // true

// --- writing a file under the freshly-created dir round-trips ---
mkdirSync("/tmp/topaz_mkdir_test/files", { recursive: true });
writeFileSync("/tmp/topaz_mkdir_test/files/x.txt", "ok");
console.log(existsSync("/tmp/topaz_mkdir_test/files/x.txt")); // true

// --- path can be a variable / function param ---
function ensure(p: string): void {
  mkdirSync(p, { recursive: true });
}
ensure("/tmp/topaz_mkdir_test/via_fn");
console.log(existsSync("/tmp/topaz_mkdir_test/via_fn")); // true

// --- trailing / and collapsed // are tolerated ---
mkdirSync("/tmp/topaz_mkdir_test/trail/", { recursive: true });
console.log(existsSync("/tmp/topaz_mkdir_test/trail")); // true
mkdirSync("/tmp/topaz_mkdir_test//double", { recursive: true });
console.log(existsSync("/tmp/topaz_mkdir_test/double")); // true
