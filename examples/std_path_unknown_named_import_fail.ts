// Phase 2.2b: `std/path` intentionally exposes only the current node:path
// call-site shortcut names. Extra named imports are loader errors.

import { relative } from "std/path";

console.log(relative("/a", "/b"));
