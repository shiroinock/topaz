/// <reference lib="es2015.promise" />

import { writeFileSync } from "node:fs";

async function bad(): Promise<void> {
  const r = writeFileSync(await Promise.resolve("/tmp/topaz.txt"), "x");
  console.log(r);
  return;
}

bad();
