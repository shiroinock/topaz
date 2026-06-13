/// <reference lib="es2015.promise" />

function markString(label: string, value: string): string {
  console.log(label);
  return value;
}

function markNumber(label: string, value: number): number {
  console.log(label);
  return value;
}

function stringPromise(label: string, value: string): Promise<string> {
  console.log(label);
  return Promise.resolve(value);
}

class AwaitReceiverBox {
  label: string = "";
  base: number = 0;

  constructor(label: string, base: number) {
    this.label = label;
    this.base = base;
  }

  value(delta: number): number {
    console.log(this.label);
    return this.base + delta;
  }
}

interface AwaitReceiverMixer {
  mix(delta: number): number;
}

class AwaitReceiverIfaceBox implements AwaitReceiverMixer {
  label: string = "";
  base: number = 0;

  constructor(label: string, base: number) {
    this.label = label;
    this.base = base;
  }

  mix(delta: number): number {
    console.log(this.label);
    return this.base + delta;
  }
}

function boxPromise(label: string, methodLabel: string, base: number): Promise<AwaitReceiverBox> {
  console.log(label);
  return Promise.resolve(new AwaitReceiverBox(methodLabel, base));
}

function mixerPromise(label: string, methodLabel: string, base: number): Promise<AwaitReceiverMixer> {
  console.log(label);
  const value: AwaitReceiverMixer = new AwaitReceiverIfaceBox(methodLabel, base);
  return Promise.resolve(value);
}

async function terminalString(): Promise<number> {
  console.log("return before");
  return (await stringPromise("return receiver", "abc")).indexOf(markString("return arg", "b"));
}

async function declaredClass(): Promise<number> {
  const value = (await boxPromise("decl receiver", "decl method", 10)).value(markNumber("decl arg", 5));
  console.log("decl value");
  console.log(value);
  return value;
}

async function interfaceReturn(): Promise<number> {
  return (await mixerPromise("iface receiver", "iface method", 20)).mix(markNumber("iface arg", 3));
}

async function discardStatement(): Promise<void> {
  (await boxPromise("discard receiver", "discard method", 30)).value(markNumber("discard arg", 4));
  console.log("discard after");
}

terminalString().then((value: number): void => {
  console.log("return then");
  console.log(value);
});

declaredClass().then((value: number): void => {
  console.log("decl then");
  console.log(value);
});

interfaceReturn().then((value: number): void => {
  console.log("iface then");
  console.log(value);
});

discardStatement().then((): void => {
  console.log("discard then");
});

console.log("sync tail");
