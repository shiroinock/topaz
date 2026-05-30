// Phase 1.5-6 prep #23: only `dirname` / `resolve` / `basename` / `extname` /
// `join` are allowed from `node:path` — `relative` (and any other named
// import) is rejected at loader time until a later prep step (or the 1.5-6f/h
// runtime/cli rewrite) needs it.
import { relative } from "node:path";
console.log(relative("/a", "/a/b"));
