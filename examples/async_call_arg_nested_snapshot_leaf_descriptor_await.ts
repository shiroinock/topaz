/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function wrap(label: string, value: number): number {
  console.log(label);
  return value + 10;
}

function combine(label: string, a: number, b: number): number {
  const value: number = a + b;
  console.log(label);
  console.log(value);
  return value;
}

function consume(label: string, a: number, b: number): void {
  console.log(label);
  console.log(a + b);
}

async function initializerCall(): Promise<number> {
  const value: number = combine(
    "init call",
    await Promise.resolve(mark("init left", 1)) +
      wrap("init snapshot", wrap("init nested", await Promise.resolve(mark("init inner", 2)))),
    await Promise.resolve(mark("init right", 3)),
  );
  return value;
}

async function terminalCall(): Promise<number> {
  return combine(
    "return call",
    await Promise.resolve(mark("return left", 10)) +
      wrap(
        "return snapshot",
        wrap("return middle", wrap("return nested", await Promise.resolve(mark("return inner", 20)))),
      ),
    await Promise.resolve(mark("return right", 30)),
  );
}

async function discardCall(): Promise<void> {
  consume(
    "stmt call",
    await Promise.resolve(mark("stmt left", 100)) +
      wrap("stmt snapshot", wrap("stmt nested", await Promise.resolve(mark("stmt inner", 200)))),
    await Promise.resolve(mark("stmt right", 300)),
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
