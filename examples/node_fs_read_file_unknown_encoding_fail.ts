// Phase 1.5-6 prep #13: only "utf8" is supported as the encoding argument
// (binary / latin1 / ucs2 / etc. would change the return type).
import { readFileSync } from "node:fs";
const t: string = readFileSync("examples/fixtures/node_fs_sample.txt", "binary");
console.log(t);
