// Phase 3.6: public `std/fs` aliases the existing filesystem call-site
// shortcuts while keeping the same accepted names and argument subset.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "std/fs";

const dir: string = "/tmp/topaz_std_fs_test/a/b";
const file: string = "/tmp/topaz_std_fs_test/a/b/note.txt";

mkdirSync(dir, { recursive: true });
console.log(existsSync(dir));
console.log(existsSync(file));

writeFileSync(file, "hello std fs\n");
console.log(existsSync(file));
console.log(readFileSync(file, "utf8"));

writeFileSync(file, "again");
console.log(readFileSync(file, "utf8"));

function load(path: string): string {
  return readFileSync(path, "utf8");
}

console.log(load(file).length);
