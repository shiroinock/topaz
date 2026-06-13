/// <reference lib="es2015.promise" />
/// <reference path="./topaz_std_process_ambient.d.ts" />

import { writeError, writeStderr, writeStdout } from "std/process";

function mark(label: string, value: string): string {
  console.log(label);
  return value;
}

async function declaredWrite(): Promise<void> {
  console.log("declared pre");
  process.stdout.write(await Promise.resolve(mark("declared payload", "declared out\n")));
  console.log("declared after");
  return;
}

const arrowWrite = async (): Promise<void> => {
  console.log("arrow pre");
  writeStdout(await Promise.resolve(mark("arrow payload", "arrow out\n")));
  console.log("arrow after");
  return;
};

class ProcessWriteRunner {
  constructor() {}

  async rawErr(): Promise<void> {
    console.log("method raw pre");
    process.stderr.write(await Promise.resolve(mark("method raw payload", "method raw err\n")));
    console.log("method raw after");
    return;
  }

  async publicErr(): Promise<void> {
    console.log("method public pre");
    writeStderr(await Promise.resolve(mark("method public payload", "method public err\n")));
    console.log("method public after");
    return;
  }
}

const exprWrite: () => Promise<void> = async function (): Promise<void> {
  console.log("expr pre");
  writeError(await Promise.resolve(mark("expr payload", "expr line")));
  console.log("expr after");
  return;
};

declaredWrite().then((): void => {
  console.log("declared then");
});

arrowWrite().then((): void => {
  console.log("arrow then");
});

const runner = new ProcessWriteRunner();

runner.rawErr().then((): void => {
  console.log("method raw then");
});

runner.publicErr().then((): void => {
  console.log("method public then");
});

exprWrite().then((): void => {
  console.log("expr then");
});

console.log("sync tail");
