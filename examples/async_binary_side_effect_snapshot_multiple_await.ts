/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function initializerSnapshot(): Promise<number> {
  const value: number =
    (await Promise.resolve(mark("init left", 1))) +
    mark("init middle", 2) +
    (await Promise.resolve(mark("init right", 3)));
  console.log("init value");
  console.log(value);
  return value;
}

async function terminalReturnSnapshot(): Promise<number> {
  return (
    (await Promise.resolve(mark("return left", 10))) +
    mark("return middle", 20) +
    (await Promise.resolve(mark("return right", 30)))
  );
}

async function statementSnapshot(): Promise<void> {
  (await Promise.resolve(mark("stmt left", 100))) +
    mark("stmt middle", 200) +
    (await Promise.resolve(mark("stmt right", 300)));
  console.log("stmt done");
}

initializerSnapshot().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalReturnSnapshot().then((value: number): void => {
  console.log("return then");
  console.log(value);
});

statementSnapshot().then((): void => {
  console.log("stmt then");
});

console.log("sync tail");
