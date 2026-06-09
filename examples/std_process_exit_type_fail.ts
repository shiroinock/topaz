// Phase 3.7: public exit(code?) reuses the synthetic process.exit number check.

import { exit } from "std/process";

exit("bad");
