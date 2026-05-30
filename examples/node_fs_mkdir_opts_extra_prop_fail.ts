// Phase 1.5-6 prep #20: mkdirSync's options literal must contain exactly one
// property (`recursive: true`). Extra properties such as `mode` are rejected.
import { mkdirSync } from "node:fs";
mkdirSync("/tmp/x", { recursive: true, mode: 0 });
