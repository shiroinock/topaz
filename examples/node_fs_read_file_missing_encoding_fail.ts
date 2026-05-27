// Phase 1.5-6 prep #13: readFileSync requires the "utf8" encoding argument
// (Topaz does not model the buffer return-type variant).
import { readFileSync } from "node:fs";
const t: string = readFileSync("examples/fixtures/node_fs_sample.txt");
console.log(t);
