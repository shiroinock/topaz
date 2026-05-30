// Phase 1.5-6 prep #24: execFileSync returns void and cannot be used as a
// value (mirrors writeFileSync / mkdirSync).
import { execFileSync } from "node:child_process";
const r = execFileSync("/bin/echo", ["x"], { stdio: "inherit" });
console.log(r);
