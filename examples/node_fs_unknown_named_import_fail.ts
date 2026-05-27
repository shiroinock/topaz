// Phase 1.5-6 prep #13 / #17: only `readFileSync` / `existsSync` are currently
// allowed from `node:fs` — every other named import (writeFileSync / mkdirSync
// / ...) must still be rejected at loader time.
import { writeFileSync } from "node:fs";
writeFileSync("/tmp/x", "y");
