/// <reference lib="es2015.promise" />

import { resolve } from "node:path";

async function bad(): Promise<string> {
  return resolve(await Promise.resolve("/tmp"), "x");
}

bad();
