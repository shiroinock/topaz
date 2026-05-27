// Phase 1.5-6 prep #17: `existsSync` is recognized only at call sites
// (mirrors readFileSync from prep #13) — using it as a value must fail with
// `unknown identifier`.
import { existsSync } from "node:fs";
const f = existsSync;
console.log(f);
