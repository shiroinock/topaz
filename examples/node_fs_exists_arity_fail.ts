// Phase 1.5-6 prep #17: existsSync takes exactly one argument; the Node
// `options` second parameter is unsupported.
import { existsSync } from "node:fs";
console.log(existsSync("/tmp", "extra"));
