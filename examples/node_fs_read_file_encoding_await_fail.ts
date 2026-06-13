/// <reference lib="es2015.promise" />

import { readFileSync } from "node:fs";

async function bad(): Promise<string> {
  return readFileSync("examples/fixtures/node_fs_sample.txt", await Promise.resolve("utf8"));
}

bad();
