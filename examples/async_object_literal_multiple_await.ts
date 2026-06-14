/// <reference lib="es2015.promise" />

type Pair = { left: number; right: number };

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function initializerObject(): Promise<number> {
  const pair: Pair = {
    left: await Promise.resolve(mark("init left", 1)),
    right: await Promise.resolve(mark("init right", 2)),
  };
  const total = pair.left + pair.right;
  console.log("init result");
  console.log(total);
  return total;
}

async function terminalReturnObject(): Promise<Pair> {
  return {
    left: await Promise.resolve(mark("return left", 10)),
    right: await Promise.resolve(mark("return right", 20)),
  };
}

initializerObject().then((n: number): void => {
  console.log("init then");
  console.log(n);
});

terminalReturnObject().then((pair: Pair): void => {
  console.log("return then");
  console.log(pair.left + pair.right);
});

console.log("sync tail");
