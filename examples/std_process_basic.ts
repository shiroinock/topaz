// Phase 3.7: public `std/process` exposes argv, exit, raw stdio writes, and a
// line-oriented stderr helper while matching the synthetic compatibility paths.

import { basename } from "std/path";
import { argv, exit, writeStdout, writeStderr, writeError } from "std/process";

console.log(argv.length);
console.log(basename(argv[0]));

writeStdout("a");
writeStdout("b");
writeStdout("\n");

writeStderr("err raw\n");
writeError("err line");

let count: number = 0;
for (const a of argv) {
  if (a.length > 0) {
    count = count + 1;
  }
}
console.log(count);

function localArgv(): string {
  const argv: string = "local";
  return argv;
}

console.log(localArgv());
writeStdout("before exit\n");
exit(0);
writeStdout("after exit\n");
