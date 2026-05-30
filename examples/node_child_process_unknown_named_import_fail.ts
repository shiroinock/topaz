// Phase 1.5-6 prep #24: only `execFileSync` is currently allowed from
// `node:child_process` — every other named import (spawn / spawnSync /
// exec / execSync / ...) must still be rejected at loader time.
import { spawnSync } from "node:child_process";
spawnSync("/bin/echo", ["x"]);
