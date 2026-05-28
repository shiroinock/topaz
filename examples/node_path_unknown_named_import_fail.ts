// Phase 1.5-6 prep #18: only `dirname` / `resolve` are allowed from `node:path`
// for now — `join` / `basename` / `extname` are rejected at loader time until
// the 1.5-6f/h runtime/cli rewrite needs them.
import { join } from "node:path";
console.log(join("/a", "b"));
