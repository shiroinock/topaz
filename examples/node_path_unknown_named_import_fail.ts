// Phase 1.5-6 prep #22: only `dirname` / `resolve` / `basename` / `extname`
// are allowed from `node:path` — `join` (and any other named import) is
// rejected at loader time until the 1.5-6f/h runtime/cli rewrite needs it.
import { join } from "node:path";
console.log(join("/a", "b"));
