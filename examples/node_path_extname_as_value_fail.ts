// Phase 1.5-6 prep #22: `extname` is recognized only at call sites (like
// basename / dirname / resolve / readFileSync) — using it as a value must
// fail with `unknown identifier`.
import { extname } from "node:path";
const f = extname;
console.log(f);
