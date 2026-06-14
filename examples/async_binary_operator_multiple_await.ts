/// <reference lib="es2015.promise" />

function markNumber(label: string, value: number): number {
  console.log(label);
  return value;
}

function markString(label: string, value: string): string {
  console.log(label);
  return value;
}

async function initializerProduct(): Promise<number> {
  const value: number = (await Promise.resolve(markNumber("init left", 6))) * (await Promise.resolve(markNumber("init right", 7)));
  console.log("init result");
  console.log(value);
  return value;
}

async function terminalCompare(): Promise<boolean> {
  return (await Promise.resolve(markNumber("return left", 9))) > (await Promise.resolve(markNumber("return right", 4)));
}

async function discardEquality(): Promise<void> {
  (await Promise.resolve(markString("stmt left", "ready"))) === (await Promise.resolve(markString("stmt right", "ready")));
  console.log("stmt done");
}

initializerProduct().then((n: number): void => {
  console.log("init then");
  console.log(n);
});

terminalCompare().then((ok: boolean): void => {
  console.log("return then");
  console.log(ok);
});

discardEquality().then((): void => {
  console.log("stmt then");
});

console.log("sync tail");
