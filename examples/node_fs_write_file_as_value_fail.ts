// Phase 1.5-6 prep #19: writeFileSync returns void and cannot be used as a
// value (mirrors Array.push / console.log).
import { writeFileSync } from "node:fs";
const r = writeFileSync("/tmp/x", "y");
console.log(r);
