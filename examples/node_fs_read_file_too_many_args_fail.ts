// Phase 1.5-6 prep #13: readFileSync only takes (path, "utf8").
import { readFileSync } from "node:fs";
const t: string = readFileSync("examples/fixtures/node_fs_sample.txt", "utf8", "extra");
console.log(t);
