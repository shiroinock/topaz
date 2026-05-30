// Phase 1.5-6 prep #25: bare reference to `fileURLToPath` (without calling
// it) falls into the generic identifier path and must reject as `unknown
// identifier` — only the call-site shortcut is wired up (mirrors
// readFileSync / existsSync / dirname / basename / extname / join etc).
import { fileURLToPath } from "node:url";
const fn = fileURLToPath;
console.log(fn);
