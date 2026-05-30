// Phase 1.5-6 prep #20: mkdirSync's second argument must be a literal
// `{ recursive: true }` object — a boolean / other non-object is rejected.
import { mkdirSync } from "node:fs";
mkdirSync("/tmp/x", true);
