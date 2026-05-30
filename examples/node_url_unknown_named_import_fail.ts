// Phase 1.5-6 prep #25: only `fileURLToPath` is allowed from `node:url` —
// every other named import (URL / URLSearchParams / pathToFileURL / ...)
// must still be rejected at loader time.
import { pathToFileURL } from "node:url";
pathToFileURL("/tmp/x");
