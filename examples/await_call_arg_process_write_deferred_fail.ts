/// <reference lib="es2015.promise" />

import { writeStdout } from "std/process";

async function bad(): Promise<void> {
  const r = writeStdout(await Promise.resolve("x"));
  console.log(r);
  return;
}

bad();
