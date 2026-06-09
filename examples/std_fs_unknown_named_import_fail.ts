// Phase 3.6: `std/fs` intentionally exposes only the current filesystem
// call-site shortcut names. Extra named imports are loader errors.

import { unlinkSync } from "std/fs";

unlinkSync("/tmp/x");
