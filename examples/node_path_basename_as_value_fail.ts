// Phase 1.5-6 prep #21: `basename` is recognized only at call sites (like
// dirname / resolve / readFileSync) — using it as a value must fail with
// `unknown identifier`.
import { basename } from "node:path";
const f = basename;
console.log(f);
