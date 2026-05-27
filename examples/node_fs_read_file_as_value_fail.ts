// Phase 1.5-6 prep #13: `readFileSync` is recognized only at call sites
// (mirrors String.fromCharCode from prep #12) — using it as a value must
// continue to fail with `unknown identifier`.
import { readFileSync } from "node:fs";
const f = readFileSync;
console.log(f);
