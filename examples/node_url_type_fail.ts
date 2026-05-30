// Phase 1.5-6 prep #25: fileURLToPath argument must be string.
import { fileURLToPath } from "node:url";
const p: string = fileURLToPath(42);
console.log(p);
