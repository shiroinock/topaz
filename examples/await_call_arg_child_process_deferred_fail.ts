/// <reference lib="es2015.promise" />

import { execFileSync } from "node:child_process";

async function bad(): Promise<void> {
  const r = execFileSync(await Promise.resolve("/bin/echo"), ["x"], { stdio: "inherit" });
  console.log(r);
  return;
}

bad();
