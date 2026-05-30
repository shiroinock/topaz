// Phase 1.5-6 prep #21: basename ext argument must be string.
import { basename } from "node:path";
console.log(basename("/a/b.ts", 123));
