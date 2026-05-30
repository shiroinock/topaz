// Phase 1.5-6 prep #24: args argument must be Array<string> (Array<number>
// is rejected at codegen time).
import { execFileSync } from "node:child_process";
const wrong: number[] = [1, 2];
execFileSync("/bin/echo", wrong, { stdio: "inherit" });
