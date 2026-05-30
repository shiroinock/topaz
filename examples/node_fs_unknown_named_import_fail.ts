// Phase 1.5-6 prep #13 / #17 / #19: only `readFileSync` / `existsSync` /
// `writeFileSync` are currently allowed from `node:fs` — every other named
// import (mkdirSync / unlinkSync / ...) must still be rejected at loader time.
import { mkdirSync } from "node:fs";
mkdirSync("/tmp/x");
