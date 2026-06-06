// Phase 2.2b: public `std/path` aliases the existing node:path call-site
// shortcuts while keeping the same imported names and POSIX behavior.

import { dirname, resolve, basename, extname, join } from "std/path";

console.log(dirname("/pkg/src/index.ts"));
console.log(resolve("/pkg", "src", "../dist", "main.ts"));
console.log(basename("/pkg/src/index.ts", ".ts"));
console.log(extname("/pkg/src/index.ts"));
console.log(join("/pkg", "src", "parser.ts"));

function withoutExt(path: string): string {
  return join(dirname(path), basename(path, extname(path)));
}

console.log(withoutExt("/pkg/src/cli.ts"));
