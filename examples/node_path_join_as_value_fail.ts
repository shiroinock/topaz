// Phase 1.5-6 prep #23: `join` is a call-site only shortcut. Taking it as a
// value (e.g. `const j = join;`) hits the generic "unknown identifier" path
// — the same handling as dirname / resolve / basename / extname.
import { join } from "node:path";
const j = join;
console.log(j("/a", "b"));
