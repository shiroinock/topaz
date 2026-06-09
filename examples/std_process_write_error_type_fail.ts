// Phase 3.7: public writeError(s) is string-only even though console.error
// compatibility accepts multiple scalar families.

import { writeError } from "std/process";

writeError(1);
