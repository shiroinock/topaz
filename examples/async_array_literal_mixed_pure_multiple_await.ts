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

async function initializerArray(): Promise<number> {
  const stable = 5;
  const box = new Box(7);
  const values: Array<Array<number>> = [
    [stable, await Promise.resolve(mark("init first", 1))],
    [stable + 1, await Promise.resolve(mark("init second", 2)), box.value],
  ];
  const total = values[0][0] + values[0][1] + values[1][0] + values[1][1] + values[1][2];
  console.log("init result");
  console.log(total);
  return total;
}

async function terminalReturnArray(): Promise<Array<Array<number>>> {
  const tail = 30;
  return [
    [tail, await Promise.resolve(mark("return first", 10))],
    [await Promise.resolve(mark("return second", 20)), tail + 1],
  ];
}

async function discardArray(): Promise<void> {
  const stable = 100;
  [
    [stable, await Promise.resolve(mark("stmt first", 1))],
    [stable + 1, await Promise.resolve(mark("stmt second", 2))],
  ];
  console.log("stmt done");
}

initializerArray().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalReturnArray().then((values: Array<Array<number>>): void => {
  console.log("return then");
  console.log(values[0][0] + values[0][1] + values[1][0] + values[1][1]);
});

discardArray().then((): void => {
  console.log("stmt then");
});

console.log("sync tail");
