/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function initializerTree(): Promise<number> {
  const value: number =
    (await Promise.resolve(mark("init left", 1))) +
    ((await Promise.resolve(mark("init middle", 2))) + (await Promise.resolve(mark("init right", 3))));
  console.log("init result");
  console.log(value);
  return value;
}

async function terminalReturnTree(): Promise<number> {
  return ((await Promise.resolve(mark("return left", 10))) * (await Promise.resolve(mark("return middle", 4)))) - (await Promise.resolve(mark("return right", 2)));
}

async function discardTree(): Promise<void> {
  (await Promise.resolve(mark("stmt left", 1))) + ((await Promise.resolve(mark("stmt middle", 1))) + (await Promise.resolve(mark("stmt right", 0))));
  console.log("stmt done");
}

initializerTree().then((n: number): void => {
  console.log("init then");
  console.log(n);
});

terminalReturnTree().then((n: number): void => {
  console.log("return then");
  console.log(n);
});

discardTree().then((): void => {
  console.log("stmt then");
});

console.log("sync tail");
