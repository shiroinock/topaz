// Phase 1.5-6 prep #23: node:path.join(...segments) (POSIX).
// Same call-site syntactic-shortcut path as dirname / resolve / basename /
// extname. Variadic: zero args is allowed (Node returns "."). Output mirrors
// Node's path.posix.join bit-for-bit (port of normalizeString + leading /
// trailing slash handling).

import { join, basename, dirname } from "node:path";

// --- zero args / all-empty args yield "." ---
console.log(join());                  // .
console.log(join("", ""));            // .

// --- basic relative + absolute join ---
console.log(join("foo", "bar"));      // foo/bar
console.log(join("/foo", "bar"));     // /foo/bar

// --- `..` resolution: relative + absolute parents ---
console.log(join("/foo", "../bar"));  // /bar
console.log(join("a", "..", "..", "b")); // ../b (allow_above_root keeps leading ..)

// --- trailing slash is preserved when middle non-empty ---
console.log(join("a/b", "c/"));       // a/b/c/

// --- empty segments are skipped, not concatenated as "//" ---
console.log(join("", "a", ""));       // a

// --- degenerate inputs: leading / and dot segments ---
console.log(join("/"));               // /
console.log(join("."));               // .
console.log(join(".."));              // ..

// --- mixed slashes are collapsed by normalize ---
console.log(join("/a/b/", "c"));      // /a/b/c
console.log(join("foo/", "/bar"));    // foo/bar

// --- the cli.ts:71 use site: join(dirname(p), basename(p, ".ts")) ---
const p = "/pkg/src/index.ts";
console.log(join(dirname(p), basename(p, ".ts"))); // /pkg/src/index
