// Phase 1.5-6 prep #22: node:path.extname(path) (POSIX).
// Same call-site syntactic-shortcut path as basename / dirname / resolve —
// the loader accepts `node:path` as a stdlib specifier and codegen recognizes
// `extname(...)` only at call sites. Returns string (includes the leading
// dot). Port of Node's path.posix.extname, so outputs match Node exactly.

import { extname } from "node:path";

// --- basic: last segment's extension is returned with the leading dot ---
console.log(extname("index.html"));      // .html
console.log(extname("index.coffee.md")); // .md (only the last `.`)
console.log(extname("index."));          // .   (trailing-dot extension is `.`)

// --- no extension: returns "" ---
console.log(extname("index") === "");    // true
console.log(extname(".index") === "");   // true  (leading-dot-only -> "")
console.log(extname(".index.md"));       // .md (second dot is the real ext)

// --- with directory prefix: only the last segment matters ---
console.log(extname("/foo/bar/baz.ts")); // .ts
console.log(extname("/foo/bar/") === ""); // true (last segment `bar`, no dot)
console.log(extname("/foo/bar.tar.gz")); // .gz

// --- degenerate inputs: "", ".", ".." all yield "" ---
console.log(extname("") === "");  // true
console.log(extname(".") === ""); // true
console.log(extname("..") === ""); // true

// --- through a function param: arg need not be literal ---
function extOf(p: string): string {
  return extname(p);
}
console.log(extOf("/pkg/src/index.tsx")); // .tsx
