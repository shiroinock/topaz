// Phase 1.5-6 prep #26: process.argv / process.exit / process.{stdout,stderr}
// .write + console.error. run_case invokes `./build/process_io` with no extra
// args, so process.argv is `[executablePath]` (length 1) — basename recovers
// the test slug. console.error / process.stderr.write go to fd 2, which
// run_case does not capture, so they must NOT appear in the expected stdout.
import { basename } from "node:path";

const argv: string[] = process.argv;
console.log(argv.length); // 1 (just the executable path)
console.log(basename(argv[0])); // process_io

// process.stdout.write does NOT append a newline (unlike console.log): the
// three writes coalesce into one "ab\n" line.
process.stdout.write("a");
process.stdout.write("b");
process.stdout.write("\n");

// To fd 2 — proven to compile + run, but absent from the captured stdout.
console.error("err line");
process.stderr.write("err raw\n");

// argv is a real Array<string>: for-of walks it, counting non-empty elements.
let count: number = 0;
for (const a of argv) {
  if (a.length > 0) {
    count = count + 1;
  }
}
console.log(count); // 1

// process.exit(0) terminates immediately; the trailing writes never run.
process.stdout.write("before exit\n");
process.exit(0);
process.stdout.write("after exit\n");
console.log("unreachable");
