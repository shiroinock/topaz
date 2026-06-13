/// <reference lib="es2015.promise" />

import { basename, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

async function declaredDirname(): Promise<string> {
  console.log("declared pre");
  const parent: string = dirname(await Promise.resolve("/a/b.ts"));
  console.log("declared dir");
  console.log(parent);
  return parent;
}

const arrowBasename = async (path: string): Promise<string> => {
  console.log("arrow pre");
  const base: string = basename(path, await Promise.resolve(".ts"));
  console.log("arrow base");
  console.log(base);
  return base;
};

class PathUrlRunner {
  constructor() {}

  async extension(): Promise<string> {
    console.log("method pre");
    const ext: string = extname(await Promise.resolve("/pkg/index.mjs"));
    console.log("method ext");
    console.log(ext);
    return ext;
  }
}

const exprFilePath: () => Promise<string> = async function (): Promise<string> {
  console.log("expr pre");
  return fileURLToPath(await Promise.resolve("file:///tmp/a%20b.ts"));
};

async function discardPath(): Promise<void> {
  console.log("discard pre");
  dirname(await Promise.resolve("/discard/tail.ts"));
  console.log("discard after");
  return;
}

declaredDirname().then((parent: string): void => {
  console.log("declared then");
  console.log(parent);
});

arrowBasename("/tmp/main.ts").then((base: string): void => {
  console.log("arrow then");
  console.log(base);
});

new PathUrlRunner().extension().then((ext: string): void => {
  console.log("method then");
  console.log(ext);
});

exprFilePath().then((path: string): void => {
  console.log("expr then");
  console.log(path);
});

discardPath().then((): void => {
  console.log("discard then");
});

console.log("sync tail");
