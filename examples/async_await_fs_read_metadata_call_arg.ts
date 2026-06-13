/// <reference lib="es2015.promise" />

import { existsSync, readFileSync } from "node:fs";

function markPath(label: string): string {
  console.log(label);
  return "examples/fixtures/node_fs_sample.txt";
}

async function declaredRead(): Promise<string> {
  console.log("declared pre");
  const text: string = readFileSync(await Promise.resolve(markPath("declared path")), "utf8");
  console.log("declared read");
  console.log(text.slice(0, 5));
  return text;
}

const arrowExists = async (): Promise<boolean> => {
  console.log("arrow pre");
  const ok: boolean = existsSync(await Promise.resolve(markPath("arrow path")));
  console.log("arrow exists");
  console.log(ok);
  return ok;
};

class FsReadRunner {
  constructor() {}

  async read(): Promise<string> {
    console.log("method pre");
    return readFileSync(await Promise.resolve(markPath("method path")), "utf8");
  }
}

const exprExists: () => Promise<boolean> = async function (): Promise<boolean> {
  console.log("expr pre");
  return existsSync(await Promise.resolve(markPath("expr path")));
};

async function discardRead(): Promise<void> {
  console.log("discard pre");
  readFileSync(await Promise.resolve(markPath("discard path")), "utf8");
  console.log("discard after");
  return;
}

declaredRead().then((text: string): void => {
  console.log("declared then");
  console.log(text.slice(0, 5));
});

arrowExists().then((ok: boolean): void => {
  console.log("arrow then");
  console.log(ok);
});

new FsReadRunner().read().then((text: string): void => {
  console.log("method then");
  console.log(text.slice(0, 5));
});

exprExists().then((ok: boolean): void => {
  console.log("expr then");
  console.log(ok);
});

discardRead().then((): void => {
  console.log("discard then");
});

console.log("sync tail");
