// Phase 1.5-6 prep #18: node:path.dirname / resolve (POSIX).
// Same call-site syntactic-shortcut path as node:fs.readFileSync/existsSync —
// the loader accepts `node:path` as a stdlib specifier and codegen recognizes
// `dirname(...)` / `resolve(...)` only at call sites. Both return string.
// Ports of Node's path.posix algorithms, so outputs match Node exactly.

import { dirname, resolve } from "node:path";

// --- dirname: directory portion, "." / "/" edge cases ---
console.log(dirname("/foo/bar/baz.ts")); // /foo/bar
console.log(dirname("/foo/bar/"));       // /foo
console.log(dirname("foo/bar"));         // foo
console.log(dirname("foo"));             // .
console.log(dirname("/foo"));            // /
console.log(dirname("/"));               // /

// --- resolve: right-to-left join + "." / ".." normalization (absolute) ---
console.log(resolve("/foo", "bar"));         // /foo/bar
console.log(resolve("/a/b", "../c"));        // /a/c
console.log(resolve("/a/b/c", "..", "d"));   // /a/b/d
console.log(resolve("/foo/bar", "./baz"));   // /foo/bar/baz
console.log(resolve("/foo", "/bar"));        // /bar  (later absolute segment wins)
console.log(resolve("/x/y/z", "../../w"));   // /x/w

// --- loader-style: resolve a relative specifier against a file's dirname ---
const fromFile: string = "/a/b/main.ts";
console.log(resolve(dirname(fromFile), "./util.ts")); // /a/b/util.ts

// --- dirname/resolve through a function param (call-site arg need not be literal) ---
function parentOf(p: string): string {
  return dirname(p);
}
console.log(parentOf("/pkg/src/index.ts")); // /pkg/src

// --- relative segment falls back to getcwd → result is absolute (starts with "/") ---
const rel: string = resolve("some-relative-seg");
console.log(rel.charCodeAt(0) === 47); // true
