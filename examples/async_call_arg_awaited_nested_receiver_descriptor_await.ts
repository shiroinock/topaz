/// <reference lib="es2015.promise" />

class Box {
  constructor(label: string) {
    console.log(label);
  }

  value(label: string, value: number): number {
    console.log(label);
    console.log(value);
    return value + 10;
  }
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function wrap(label: string, value: number): number {
  console.log(label);
  return value + 100;
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
    wrap(
      "init wrap",
      (await Promise.resolve(new Box("init receiver"))).value(
        "init method",
        await Promise.resolve(mark("init arg", 1)),
      ),
    ),
    await Promise.resolve(mark("init sibling", 2)),
  );
  return value;
}

async function terminalCall(): Promise<number> {
  return combine(
    "return call",
    wrap(
      "return wrap",
      (await Promise.resolve(new Box("return receiver"))).value(
        "return method",
        await Promise.resolve(mark("return arg", 10)),
      ),
    ),
    await Promise.resolve(mark("return sibling", 40)),
  );
}

async function discardCall(): Promise<void> {
  consume(
    "stmt call",
    wrap(
      "stmt wrap",
      (await Promise.resolve(new Box("stmt receiver"))).value(
        "stmt method",
        await Promise.resolve(mark("stmt arg", 100)),
      ),
    ),
    await Promise.resolve(mark("stmt sibling", 200)),
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
