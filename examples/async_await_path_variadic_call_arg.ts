/// <reference lib="es2015.promise" />

import { join, resolve } from "node:path";

function mark(label: string, value: string): string {
  console.log(label);
  return value;
}

async function declaredResolve(): Promise<string> {
  console.log("declared pre");
  const path: string = resolve(await Promise.resolve("/tmp"), "x");
  console.log("declared path");
  console.log(path);
  return path;
}

const arrowResolve = async (prefix: string): Promise<string> => {
  console.log("arrow pre");
  const path: string = resolve(prefix, await Promise.resolve("pkg"));
  console.log("arrow path");
  console.log(path);
  return path;
};

class PathJoinRunner {
  constructor() {}

  async joined(): Promise<string> {
    console.log("method pre");
    const path: string = join(await Promise.resolve("a"), "b");
    console.log("method path");
    console.log(path);
    return path;
  }
}

const exprJoin: () => Promise<string> = async function (): Promise<string> {
  console.log("expr pre");
  return join("a", await Promise.resolve("b"), "c");
};

async function discardJoin(): Promise<void> {
  console.log("discard pre");
  join(mark("discard segment pre", "pre"), await Promise.resolve("mid"), mark("discard segment post", "post"));
  console.log("discard after");
  return;
}

declaredResolve().then((path: string): void => {
  console.log("declared then");
  console.log(path);
});

arrowResolve("/tmp").then((path: string): void => {
  console.log("arrow then");
  console.log(path);
});

new PathJoinRunner().joined().then((path: string): void => {
  console.log("method then");
  console.log(path);
});

exprJoin().then((path: string): void => {
  console.log("expr then");
  console.log(path);
});

discardJoin().then((): void => {
  console.log("discard then");
});

console.log("sync tail");
