/// <reference lib="es2015.promise" />

function markNumber(label: string, value: number): number {
  console.log(label);
  return value;
}

function markString(label: string, value: string): string {
  console.log(label);
  return value;
}

async function declared(): Promise<number> {
  return (await Promise.resolve(markNumber("decl left", 10))) + (await Promise.resolve(markNumber("decl right", 1)));
}

const arrow = async (): Promise<number> => {
  return (await Promise.resolve(markNumber("arrow left", 20))) + (await Promise.resolve(markNumber("arrow right", 2)));
};

class AsyncReturnBinaryBox {
  constructor() {}

  async value(): Promise<string> {
    return (await Promise.resolve(markString("method left", "m"))) + (await Promise.resolve(markString("method right", "!")));
  }
}

const expr: () => Promise<string> = async function (): Promise<string> {
  return (await Promise.resolve(markString("expr left", "x"))) + (await Promise.resolve(markString("expr right", "y")));
};

declared().then((n: number): void => {
  console.log("decl then");
  console.log(n);
});

arrow().then((n: number): void => {
  console.log("arrow then");
  console.log(n);
});

new AsyncReturnBinaryBox().value().then((s: string): void => {
  console.log("method then");
  console.log(s);
});

expr().then((s: string): void => {
  console.log("expr then");
  console.log(s);
});

console.log("sync tail");
