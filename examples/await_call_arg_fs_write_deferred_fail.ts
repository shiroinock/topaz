/// <reference lib="es2015.promise" />

import { writeFileSync } from "node:fs";

async function bad(): Promise<void> {
  writeFileSync(await Promise.resolve("/tmp/topaz.txt"), "x");
  return;
}

bad();
