/// <reference lib="es2015.promise" />

import { join } from "node:path";

function record(label: string, value: number): void {
  console.log(label);
  console.log(value);
}

async function bareStatement(): Promise<void> {
  record("bare call", 1 + await Promise.resolve(2));
  return;
}

async function staticInitializer(): Promise<string> {
  const value: string = String.fromCharCode(60 + await Promise.resolve(5));
  console.log("char");
  console.log(value);
  return value;
}

async function parserInitializer(): Promise<number> {
  const value: number = parseInt("1" + await Promise.resolve("2"), 10);
  console.log("parse");
  console.log(value);
  return value;
}

async function pathInitializer(): Promise<string> {
  const value: string = join("/tmp", "x" + await Promise.resolve("y"));
  console.log("path");
  console.log(value);
  return value;
}

async function methodReturn(): Promise<string> {
  return "abcdef".slice(1 + await Promise.resolve(2));
}

bareStatement().then((): void => {
  console.log("bare then");
});

staticInitializer().then((value: string): void => {
  console.log("static then");
  console.log(value);
});

parserInitializer().then((value: number): void => {
  console.log("parser then");
  console.log(value);
});

pathInitializer().then((value: string): void => {
  console.log("path then");
  console.log(value);
});

methodReturn().then((value: string): void => {
  console.log("return then");
  console.log(value);
});

console.log("sync tail");
