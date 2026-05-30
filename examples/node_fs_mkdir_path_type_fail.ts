// Phase 1.5-6 prep #20: mkdirSync path argument must be string.
import { mkdirSync } from "node:fs";
mkdirSync(42, { recursive: true });
