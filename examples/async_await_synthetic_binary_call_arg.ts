/// <reference lib="es2015.promise" />

import { join } from "node:path";

function markNumber(label: string, value: number): number {
  console.log(label);
  return value;
}

function markString(label: string, value: string): string {
  console.log(label);
  return value;
}

async function declaredChar(): Promise<string> {
  const ch: string = String.fromCharCode(
    await Promise.resolve(markNumber("char left", 5)) + await Promise.resolve(markNumber("char right", 60)),
  );
  console.log("char value");
  console.log(ch);
  return ch;
}

async function parsedReturn(): Promise<number> {
  return parseInt(
    await Promise.resolve(markString("parse left", "1")) + await Promise.resolve(markString("parse right", "2")),
    10,
  );
}

async function discardedJoin(): Promise<void> {
  join(
    "/tmp",
    await Promise.resolve(markString("join left", "x")) + await Promise.resolve(markString("join right", "y")),
  );
  console.log("join discarded");
}

declaredChar().then((value: string): void => {
  console.log("char then");
  console.log(value);
});

parsedReturn().then((value: number): void => {
  console.log("parse then");
  console.log(value);
});

discardedJoin().then((): void => {
  console.log("join then");
});

console.log("sync tail");
