// Phase 1.5-6 prep #24: execFileSync requires exactly three arguments —
// (cmd, args, { stdio: "inherit" }). Missing the options literal must fail.
import { execFileSync } from "node:child_process";
execFileSync("/bin/echo", ["x"]);
