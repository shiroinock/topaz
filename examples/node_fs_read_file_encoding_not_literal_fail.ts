// Phase 1.5-6 prep #13: readFileSync encoding argument must be the *string
// literal* "utf8" — a variable holding the same value is rejected because
// the choice of "utf8" gates the return-type to `string` (vs. `Buffer`).
import { readFileSync } from "node:fs";
const enc: string = "utf8";
const t: string = readFileSync("examples/fixtures/node_fs_sample.txt", enc);
console.log(t);
