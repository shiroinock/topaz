/// <reference lib="es2015.promise" />

import { join } from "node:path";

async function bad(): Promise<string> {
  return join("/tmp", "x" + await Promise.resolve("y"));
}

bad();
