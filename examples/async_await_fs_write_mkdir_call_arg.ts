/// <reference lib="es2015.promise" />

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

function mark(label: string, value: string): string {
  console.log(label);
  return value;
}

async function declaredWrite(): Promise<void> {
  console.log("declared pre");
  writeFileSync(await Promise.resolve(mark("declared path", "/tmp/topaz_async_fs_425_declared.txt")), "declared text");
  console.log("declared wrote");
  return;
}

const arrowWrite = async (): Promise<void> => {
  console.log("arrow pre");
  writeFileSync("/tmp/topaz_async_fs_425_arrow.txt", await Promise.resolve(mark("arrow content", "arrow text")));
  console.log("arrow wrote");
  return;
};

class FsWriteRunner {
  constructor() {}

  async mkdir(): Promise<void> {
    console.log("method pre");
    mkdirSync(await Promise.resolve(mark("method path", "/tmp/topaz_async_fs_425_dir/a/b")), { recursive: true });
    console.log("method mkdir");
    return;
  }
}

const exprWrite: () => Promise<void> = async function (): Promise<void> {
  console.log("expr pre");
  writeFileSync(await Promise.resolve(mark("expr path", "/tmp/topaz_async_fs_425_expr.txt")), "expr text");
  console.log("expr wrote");
  return;
};

declaredWrite().then((): void => {
  console.log("declared then");
  console.log(readFileSync("/tmp/topaz_async_fs_425_declared.txt", "utf8"));
});

arrowWrite().then((): void => {
  console.log("arrow then");
  console.log(readFileSync("/tmp/topaz_async_fs_425_arrow.txt", "utf8"));
});

new FsWriteRunner().mkdir().then((): void => {
  console.log("method then");
  console.log(existsSync("/tmp/topaz_async_fs_425_dir/a/b"));
});

exprWrite().then((): void => {
  console.log("expr then");
  console.log(readFileSync("/tmp/topaz_async_fs_425_expr.txt", "utf8"));
});

console.log("sync tail");
