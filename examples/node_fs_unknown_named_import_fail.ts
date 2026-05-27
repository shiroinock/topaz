// Phase 1.5-6 prep #13: only `readFileSync` is currently allowed from
// `node:fs` — every other named import (existsSync / writeFileSync / ...)
// must be rejected at loader time.
import { existsSync } from "node:fs";
console.log(existsSync("/tmp"));
