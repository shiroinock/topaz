/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function combine(label: string, a: number, b: number, c: number): number {
  const value: number = a + b + c;
  console.log(label);
  console.log(value);
  return value;
}

function consume(label: string, a: number, b: number, c: number): void {
  console.log(label);
  console.log(a + b + c);
}

async function initializerCall(): Promise<number> {
  const value: number = combine(
    "init call",
    await Promise.resolve(mark("init left", 1)) + mark("init tail", 2),
    mark("init between", 3),
    await Promise.resolve(mark("init right", 4)),
  );
  return value;
}

async function terminalCall(): Promise<number> {
  return combine(
    "return call",
    await Promise.resolve(mark("return left", 10)) + mark("return tail", 20),
    mark("return between", 30),
    await Promise.resolve(mark("return right", 40)),
  );
}

async function discardCall(): Promise<void> {
  consume(
    "stmt call",
    await Promise.resolve(mark("stmt left", 5)) + mark("stmt tail", 6),
    mark("stmt between", 7),
    await Promise.resolve(mark("stmt right", 8)),
  );
}

initializerCall().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalCall().then((value: number): void => {
  console.log("return then");
  console.log(value);
});

discardCall().then((): void => {
  console.log("stmt then");
});

console.log("sync tail");
