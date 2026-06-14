/// <reference lib="es2015.promise" />

class Box {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function consume(value: number): void {
  console.log("consume");
  console.log(value);
}

async function initializerMixedPure(): Promise<number> {
  const local = 4;
  const box = new Box(5);
  const value: number =
    (await Promise.resolve(mark("init left", 1))) +
    local +
    box.value +
    2 +
    (await Promise.resolve(mark("init right", 3)));
  console.log("init value");
  console.log(value);
  return value;
}

async function terminalReturnMixedPure(): Promise<number> {
  const local = 7;
  const box = new Box(8);
  return (await Promise.resolve(mark("return left", 10))) + +local + box.value + (await Promise.resolve(mark("return right", 20)));
}

async function statementMixedPure(): Promise<void> {
  const local = 2;
  const box = new Box(3);
  (await Promise.resolve(mark("stmt left", 1))) + local + box.value + (await Promise.resolve(mark("stmt right", 4)));
  console.log("stmt done");
}

async function callArgMixedPure(): Promise<void> {
  const local = 5;
  const box = new Box(6);
  consume((await Promise.resolve(mark("call left", 10))) + local + box.value + 1 + (await Promise.resolve(mark("call right", 20))));
}

initializerMixedPure().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalReturnMixedPure().then((value: number): void => {
  console.log("return then");
  console.log(value);
});

statementMixedPure().then((): void => {
  console.log("stmt then");
});

callArgMixedPure().then((): void => {
  console.log("call then");
});

console.log("sync tail");
