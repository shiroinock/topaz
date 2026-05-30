// Phase 1.5-6 prep #20: mkdirSync returns void and cannot be used as a value
// (mirrors writeFileSync / Array.push / console.log).
import { mkdirSync } from "node:fs";
const r = mkdirSync("/tmp/x", { recursive: true });
console.log(r);
