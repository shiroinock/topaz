// Phase 1.5-6 prep #20: mkdirSync requires exactly two arguments
// (path, { recursive: true }) — the single-arg Node form is unsupported in
// this dialect (Topaz hard-codes recursive mode).
import { mkdirSync } from "node:fs";
mkdirSync("/tmp/x");
