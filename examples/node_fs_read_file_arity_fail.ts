// Phase 1.5-6 prep #13: readFileSync requires exactly two arguments.
import { readFileSync } from "node:fs";
const t: string = readFileSync();
console.log(t);
