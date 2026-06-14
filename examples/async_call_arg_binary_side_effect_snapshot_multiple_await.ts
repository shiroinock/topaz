/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function recordNumber(label: string, value: number): number {
  console.log(label);
  console.log(value);
  return value;
}

function consumeNumber(label: string, value: number): void {
  console.log(label);
  console.log(value);
}

async function initializerCall(): Promise<number> {
  const value: number = recordNumber(
    "init call",
    await Promise.resolve(mark("init left", 1)) +
      mark("init middle", 2) +
      await Promise.resolve(mark("init right", 3)) +
      mark("init tail", 4),
  );
  return value;
}

async function terminalSyntheticCall(): Promise<string> {
  return String.fromCharCode(
    await Promise.resolve(mark("return left", 5)) +
      mark("return middle", 10) +
      await Promise.resolve(mark("return right", 50)) +
      mark("return tail", 0),
  );
}

async function discardCall(): Promise<void> {
  consumeNumber(
    "stmt call",
    await Promise.resolve(mark("stmt left", 6)) +
      mark("stmt middle", 7) +
      await Promise.resolve(mark("stmt right", 8)) +
      mark("stmt tail", 9),
  );
}

initializerCall().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalSyntheticCall().then((value: string): void => {
  console.log("return then");
  console.log(value);
});

discardCall().then((): void => {
  console.log("stmt then");
});

console.log("sync tail");
