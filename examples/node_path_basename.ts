// Phase 1.5-6 prep #21: node:path.basename(path, ext?) (POSIX).
// Same call-site syntactic-shortcut path as node:path.dirname / resolve —
// the loader accepts `node:path` as a stdlib specifier and codegen recognizes
// `basename(...)` only at call sites. Returns string. Port of Node's
// path.posix.basename, so outputs match Node exactly.

import { basename } from "node:path";

// --- basename without ext: last segment, trailing slashes stripped ---
console.log(basename("/foo/bar/baz.ts")); // baz.ts
console.log(basename("/foo/bar/"));       // bar
console.log(basename("foo/bar"));         // bar
console.log(basename("foo"));             // foo
console.log(basename("/foo"));            // foo

// --- empty / all-slashes input: no non-slash chars -> "" ---
console.log(basename(""));                // (empty)
console.log(basename("/") === "");        // true

// --- basename with matching ext: suffix is stripped from last segment ---
console.log(basename("/foo/bar/baz.ts", ".ts")); // baz
console.log(basename("foo.ts", ".ts"));          // foo
console.log(basename("/a/b/main.tsx", ".tsx"));  // main

// --- ext not at end: returned untouched (Node behavior) ---
console.log(basename("/foo/bar.ts", ".js")); // bar.ts

// --- ext === whole path: empty result ---
console.log(basename(".ts", ".ts") === ""); // true

// --- through a function param: arg need not be literal ---
function nameOf(p: string, e: string): string {
  return basename(p, e);
}
console.log(nameOf("/pkg/src/index.ts", ".ts")); // index
