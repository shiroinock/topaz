// Phase 1.5-6 prep #25: fileURLToPath takes exactly one argument. Calling
// it with zero / two args must fail at codegen time.
import { fileURLToPath } from "node:url";
const p: string = fileURLToPath();
console.log(p);
