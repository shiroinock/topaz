// Phase 1.5-6 prep #13 / #17 / #19 / #20: only `readFileSync` / `existsSync` /
// `writeFileSync` / `mkdirSync` are currently allowed from `node:fs` — every
// other named import (unlinkSync / appendFileSync / ...) must still be
// rejected at loader time.
import { unlinkSync } from "node:fs";
unlinkSync("/tmp/x");
