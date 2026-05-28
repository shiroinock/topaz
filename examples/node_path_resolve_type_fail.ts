// Phase 1.5-6 prep #18: every resolve segment must be a string.
import { resolve } from "node:path";
console.log(resolve("/a", 42));
