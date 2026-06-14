/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function combine(label: string, a: number, b: number, c: number, d: number): number {
  const value: number = a + b + c + d;
  console.log(label);
  console.log(value);
  return value;
}

function consume(label: string, a: number, b: number, c: number, d: number): void {
  console.log(label);
  console.log(a + b + c + d);
}

async function initializerCall(): Promise<number> {
  const value: number = combine(
    "init call",
    await Promise.resolve(mark("init left", 1)) + mark("init tail", 2),
    mark("init between", 3),
    await Promise.resolve(mark("init right", 4)) +
      mark("init right tail", 5) +
      await Promise.resolve(mark("init far", 6)),
    await Promise.resolve(mark("init direct", 7)),
  );
  return value;
}

async function terminalCall(): Promise<number> {
  return combine(
    "return call",
    await Promise.resolve(mark("return left", 10)) + mark("return tail", 20),
    mark("return between", 30),
    await Promise.resolve(mark("return right", 40)) +
      mark("return right tail", 50) +
      await Promise.resolve(mark("return far", 60)),
    await Promise.resolve(mark("return direct", 70)),
  );
}

async function discardCall(): Promise<void> {
  consume(
    "stmt call",
    await Promise.resolve(mark("stmt left", 100)) + mark("stmt tail", 200),
    mark("stmt between", 300),
    await Promise.resolve(mark("stmt right", 400)) +
      mark("stmt right tail", 500) +
      await Promise.resolve(mark("stmt far", 600)),
    await Promise.resolve(mark("stmt direct", 700)),
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
