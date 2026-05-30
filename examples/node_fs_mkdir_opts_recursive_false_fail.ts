// Phase 1.5-6 prep #20: mkdirSync's `recursive` must be the literal `true` —
// `false` (non-recursive) is unsupported because the runtime always walks the
// segments.
import { mkdirSync } from "node:fs";
mkdirSync("/tmp/x", { recursive: false });
