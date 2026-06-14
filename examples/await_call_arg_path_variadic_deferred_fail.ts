/// <reference lib="es2015.promise" />

import { join } from "node:path";

function mark(label: string, value: string): string {
  console.log(label);
  return value;
}

async function bad(): Promise<string> {
  let middle = "";
  return join("/tmp", await Promise.resolve("x") + (middle = mark("mixed", "")) + await Promise.resolve(mark("post", "y")));
}

bad();
