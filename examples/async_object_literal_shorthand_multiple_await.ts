/// <reference lib="es2015.promise" />

type InitPair = { left: number; stable: number; right: number };
type ReturnPair = { head: number; middle: number; tail: number };

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function initializerObject(): Promise<number> {
  const stable = 5;
  const pair: InitPair = {
    left: await Promise.resolve(mark("init left", 1)),
    stable,
    right: await Promise.resolve(mark("init right", 2)),
  };
  const total = pair.left + pair.stable + pair.right;
  console.log("init result");
  console.log(total);
  return total;
}

async function terminalReturnObject(): Promise<ReturnPair> {
  const middle = 40;
  return {
    head: await Promise.resolve(mark("return head", 10)),
    middle,
    tail: await Promise.resolve(mark("return tail", 60)),
  };
}

initializerObject().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalReturnObject().then((pair: ReturnPair): void => {
  console.log("return then");
  console.log(pair.head + pair.middle + pair.tail);
});

console.log("sync tail");
