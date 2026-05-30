// Phase 1.5-6 prep #24: options must be the syntactic object literal
// { stdio: "inherit" } — passing some other shape (a plain string here)
// must be rejected at codegen time.
import { execFileSync } from "node:child_process";
execFileSync("/bin/echo", ["x"], "inherit");
