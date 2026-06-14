/// <reference lib="es2015.promise" />

type Pair = { left: number; middle: number; right: number; tail: number };

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

async function initializerObject(): Promise<number> {
  const stable = 5;
  const box = new Box(7);
  const pair: Pair = {
    left: await Promise.resolve(mark("init left", 1)),
    middle: stable + 1,
    right: await Promise.resolve(mark("init right", 2)),
    tail: box.value,
  };
  const total = pair.left + pair.middle + pair.right + pair.tail;
  console.log("init result");
  console.log(total);
  return total;
}

async function terminalReturnObject(): Promise<Pair> {
  const stable = 30;
  const box = new Box(40);
  return {
    left: stable,
    middle: await Promise.resolve(mark("return middle", 10)),
    right: stable + 1,
    tail: await Promise.resolve(mark("return tail", box.value)),
  };
}

initializerObject().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalReturnObject().then((pair: Pair): void => {
  console.log("return then");
  console.log(pair.left + pair.middle + pair.right + pair.tail);
});

console.log("sync tail");
