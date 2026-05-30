// Phase 1.5-6 prep #19: writeFileSync content argument must be string
// (Buffer / number / object are unsupported in this dialect).
import { writeFileSync } from "node:fs";
writeFileSync("/tmp/x", 1);
