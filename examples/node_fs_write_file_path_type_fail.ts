// Phase 1.5-6 prep #19: writeFileSync path argument must be string.
import { writeFileSync } from "node:fs";
writeFileSync(42, "y");
