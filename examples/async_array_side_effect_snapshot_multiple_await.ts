/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function initializerArraySnapshot(): Promise<number> {
  const values: Array<number> = [
    await Promise.resolve(mark("init first", 1)),
    mark("init middle", 2),
    await Promise.resolve(mark("init second", 3)),
  ];
  const total = values[0] + values[1] + values[2];
  console.log("init result");
  console.log(total);
  return total;
}

async function terminalReturnArraySnapshot(): Promise<Array<Array<number>>> {
  return [
    [await Promise.resolve(mark("return first", 10))],
    [mark("return middle", 20), await Promise.resolve(mark("return second", 30))],
  ];
}

async function statementArraySnapshot(): Promise<void> {
  [
    await Promise.resolve(mark("stmt first", 100)),
    mark("stmt middle", 200),
    await Promise.resolve(mark("stmt second", 300)),
  ];
  console.log("stmt done");
}

initializerArraySnapshot().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalReturnArraySnapshot().then((values: Array<Array<number>>): void => {
  console.log("return then");
  console.log(values[0][0] + values[1][0] + values[1][1]);
});

statementArraySnapshot().then((): void => {
  console.log("stmt then");
});

console.log("sync tail");
