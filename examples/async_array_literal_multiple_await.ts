/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function initializerArray(): Promise<number> {
  const values: Array<number> = [
    await Promise.resolve(mark("init first", 1)),
    await Promise.resolve(mark("init second", 2)),
    await Promise.resolve(mark("init third", 3)),
  ];
  const total = values[0] + values[1] + values[2];
  console.log("init result");
  console.log(total);
  return total;
}

async function terminalReturnArray(): Promise<Array<number>> {
  return [
    await Promise.resolve(mark("return first", 10)),
    await Promise.resolve(mark("return second", 20)),
  ];
}

async function discardArray(): Promise<void> {
  [
    await Promise.resolve(mark("stmt first", 100)),
    await Promise.resolve(mark("stmt second", 200)),
  ];
  console.log("stmt done");
}

initializerArray().then((n: number): void => {
  console.log("init then");
  console.log(n);
});

terminalReturnArray().then((values: Array<number>): void => {
  console.log("return then");
  console.log(values[0] + values[1]);
});

discardArray().then((): void => {
  console.log("stmt then");
});

console.log("sync tail");
