// Phase 1.5-6 prep #20: mkdirSync's options literal must have property
// `recursive` — `mode` / other Node options are unsupported.
import { mkdirSync } from "node:fs";
mkdirSync("/tmp/x", { mode: 0 });
