// Phase 1.5-6 prep #24: only `stdio: "inherit"` is accepted — other modes
// like "pipe" / "ignore" would need pipe handling that is out of scope.
import { execFileSync } from "node:child_process";
execFileSync("/bin/echo", ["x"], { stdio: "pipe" });
