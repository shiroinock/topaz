// Phase 1.5-6 prep #23: non-string arg is rejected with `join segment
// argument must be string`. The check fires for any of the variadic slots —
// here the second segment is a number literal.
import { join } from "node:path";
console.log(join("/foo", 42));
