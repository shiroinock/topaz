// Phase 1.5-6 prep #18: `resolve` is recognized only at call sites (like the
// node:fs builtins) — using it as a value must fail with `unknown identifier`.
import { resolve } from "node:path";
const f = resolve;
console.log(f);
