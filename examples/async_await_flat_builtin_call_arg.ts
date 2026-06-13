/// <reference lib="es2015.promise" />

async function declaredInitializer(): Promise<number> {
  console.log("declared pre");
  const n: number = parseInt(await Promise.resolve("7b"), 16);
  console.log("declared parsed");
  console.log(n);
  return n;
}

const arrowRadix = async (text: string): Promise<number> => {
  console.log("arrow pre");
  const n: number = parseInt(text, await Promise.resolve(16));
  console.log("arrow parsed");
  console.log(n);
  return n;
};

class FlatBuiltinRunner {
  constructor() {}

  async readFloat(): Promise<number> {
    console.log("method pre");
    const n: number = parseFloat(await Promise.resolve("2.5"));
    console.log("method parsed");
    console.log(n);
    return n;
  }
}

const exprReturnFloat: () => Promise<number> = async function (): Promise<number> {
  console.log("expr pre");
  return parseFloat(await Promise.resolve("6.25"));
};

async function discardParse(): Promise<void> {
  console.log("discard pre");
  parseInt(await Promise.resolve("42"), 10);
  console.log("discard after");
  return;
}

declaredInitializer().then((n: number): void => {
  console.log("declared then");
  console.log(n);
});

arrowRadix("ff").then((n: number): void => {
  console.log("arrow then");
  console.log(n);
});

new FlatBuiltinRunner().readFloat().then((n: number): void => {
  console.log("method then");
  console.log(n);
});

exprReturnFloat().then((n: number): void => {
  console.log("expr then");
  console.log(n);
});

discardParse().then((): void => {
  console.log("discard then");
});

console.log("sync tail");
