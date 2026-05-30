// Phase 1.5-6 prep #24: cmd argument must be string.
import { execFileSync } from "node:child_process";
execFileSync(42, ["x"], { stdio: "inherit" });
