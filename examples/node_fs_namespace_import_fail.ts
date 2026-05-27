// Phase 1.5-6 prep #13: namespace import from `node:fs` is rejected
// (the stdlib-import path validates form-by-form just like the regular path).
import * as fs from "node:fs";
console.log(fs);
