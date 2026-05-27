// Phase 1.5-6 prep #13: import rename (`{ a as b }`) is rejected on the
// stdlib-import path, same as the regular path.
import { readFileSync as rfs } from "node:fs";
const t: string = rfs("examples/fixtures/node_fs_sample.txt", "utf8");
console.log(t);
