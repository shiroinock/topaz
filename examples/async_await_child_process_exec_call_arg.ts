/// <reference lib="es2015.promise" />

import { execFileSync } from "node:child_process";

function markString(label: string, value: string): string {
  console.log(label);
  return value;
}

function markArgs(label: string, value: string[]): string[] {
  console.log(label);
  return value;
}

async function declaredExec(): Promise<void> {
  console.log("declared pre");
  execFileSync(await Promise.resolve(markString("declared cmd", "/bin/echo")), ["declared child"], { stdio: "inherit" });
  console.log("declared after");
  return;
}

const arrowExec = async (): Promise<void> => {
  console.log("arrow pre");
  execFileSync("/bin/echo", await Promise.resolve(markArgs("arrow args", ["arrow child"])), { stdio: "inherit" });
  console.log("arrow after");
  return;
};

class ExecRunner {
  constructor() {}

  async run(): Promise<void> {
    console.log("method pre");
    execFileSync(await Promise.resolve(markString("method cmd", "/bin/echo")), ["method child"], { stdio: "inherit" });
    console.log("method after");
    return;
  }
}

const exprExec: () => Promise<void> = async function (): Promise<void> {
  console.log("expr pre");
  execFileSync("/bin/echo", await Promise.resolve(markArgs("expr args", ["expr child"])), { stdio: "inherit" });
  console.log("expr after");
  return;
};

declaredExec().then((): void => {
  console.log("declared then");
});

arrowExec().then((): void => {
  console.log("arrow then");
});

new ExecRunner().run().then((): void => {
  console.log("method then");
});

exprExec().then((): void => {
  console.log("expr then");
});

console.log("sync tail");
