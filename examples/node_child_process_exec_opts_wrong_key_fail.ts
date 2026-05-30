// Phase 1.5-6 prep #24: the single options property must be `stdio` —
// any other key is rejected at codegen time.
import { execFileSync } from "node:child_process";
execFileSync("/bin/echo", ["x"], { cwd: "/tmp" });
