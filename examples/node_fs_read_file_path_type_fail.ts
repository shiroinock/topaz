// Phase 1.5-6 prep #13: readFileSync path argument must be `string`.
import { readFileSync } from "node:fs";
const t: string = readFileSync(42, "utf8");
console.log(t);
