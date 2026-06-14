/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function wrap(label: string, value: number): number {
  console.log(label);
  return value + 10;
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
    wrap("init outer", wrap("init middle", wrap("init inner", await Promise.resolve(mark("init left", 1))))),
    await Promise.resolve(mark("init right", 2)) + mark("init tail", 3),
    await Promise.resolve(mark("init direct", 4)),
  );
  return value;
}

async function terminalCall(): Promise<number> {
  return combine(
    "return call",
    wrap("return outer", wrap("return middle", wrap("return inner", await Promise.resolve(mark("return left", 10))))),
    await Promise.resolve(mark("return right", 20)) + mark("return tail", 30),
    await Promise.resolve(mark("return direct", 40)),
  );
}

async function discardCall(): Promise<void> {
  consume(
    "stmt call",
    wrap("stmt outer", wrap("stmt middle", wrap("stmt inner", await Promise.resolve(mark("stmt left", 100))))),
    await Promise.resolve(mark("stmt right", 200)) + mark("stmt tail", 300),
    await Promise.resolve(mark("stmt direct", 400)),
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
