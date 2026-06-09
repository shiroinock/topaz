// Phase 3.7: `std/process` intentionally exposes only the public process and
// stdio helper names. Extra named imports are loader errors.

import { env } from "std/process";

console.log(env("PATH"));
