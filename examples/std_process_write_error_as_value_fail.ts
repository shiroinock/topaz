// Phase 3.7: public writeError(s) is line-oriented stderr and returns void.

import { writeError } from "std/process";

const n: number = writeError("x");
console.log(n);
