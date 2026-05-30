// Phase 1.5-6 prep #19: writeFileSync requires exactly two arguments
// (path, content) — the Node-side options/encoding third arg is unsupported.
import { writeFileSync } from "node:fs";
writeFileSync("/tmp/x", "y", "utf8");
