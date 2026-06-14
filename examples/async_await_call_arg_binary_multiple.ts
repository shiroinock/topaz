/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function printNumber(label: string, value: number): number {
  console.log(label);
  console.log(value);
  return value;
}

function consumeNumber(label: string, value: number): void {
  console.log(label);
  console.log(value);
}

async function discardCall(): Promise<void> {
  consumeNumber(
    "stmt call",
    await Promise.resolve(mark("stmt left", 2)) + await Promise.resolve(mark("stmt post", 1)),
  );
}

async function initializerCall(): Promise<number> {
  const value: number = printNumber(
    "init result",
    await Promise.resolve(mark("init left", 3)) + await Promise.resolve(mark("init right", 4)),
  );
  return value;
}

async function terminalCall(): Promise<number> {
  return printNumber(
    "return call",
    await Promise.resolve(mark("return left", 10)) * await Promise.resolve(mark("return right", 3)),
  );
}

discardCall().then((): void => {
  console.log("stmt then");
});

initializerCall().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalCall().then((value: number): void => {
  console.log("return then");
  console.log(value);
});

console.log("sync tail");
