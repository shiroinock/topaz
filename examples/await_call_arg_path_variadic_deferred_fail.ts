/// <reference lib="es2015.promise" />

import { join } from "node:path";

function mark(label: string, value: string): string {
  console.log(label);
  return value;
}

async function bad(): Promise<string> {
  return join("/tmp", mark("pre", "x") + await Promise.resolve("y"));
}

bad();
