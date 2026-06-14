/// <reference lib="es2015.promise" />

type Pair = { left: number; middle: number; right: number; tail: number };

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function initializerObjectSnapshot(): Promise<number> {
  const pair: Pair = {
    left: await Promise.resolve(mark("init left", 1)),
    middle: mark("init middle", 2),
    right: await Promise.resolve(mark("init right", 3)),
    tail: mark("init tail", 4),
  };
  const total = pair.left + pair.middle + pair.right + pair.tail;
  console.log("init result");
  console.log(total);
  return total;
}

async function terminalReturnObjectSnapshot(): Promise<Pair> {
  return {
    left: await Promise.resolve(mark("return left", 10)),
    middle: mark("return middle", 20),
    right: await Promise.resolve(mark("return right", 30)),
    tail: mark("return tail", 40),
  };
}

initializerObjectSnapshot().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalReturnObjectSnapshot().then((pair: Pair): void => {
  console.log("return then");
  console.log(pair.left + pair.middle + pair.right + pair.tail);
});

console.log("sync tail");
