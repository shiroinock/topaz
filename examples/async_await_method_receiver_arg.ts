/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function later(label: string, value: number): Promise<number> {
  console.log(label);
  return Promise.resolve(value);
}

class AwaitReceiverArgBox {
  callLabel: string = "";
  base: number = 0;

  constructor(callLabel: string, base: number) {
    this.callLabel = callLabel;
    this.base = base;
  }

  combine(a: number, b: number, c: number): number {
    console.log(this.callLabel);
    return this.base + a * 100 + b * 10 + c;
  }

  consume(a: number, b: number): void {
    console.log(this.callLabel);
    console.log(a + b);
  }
}

interface AwaitReceiverArgMixer {
  combine(a: number, b: number, c: number): number;
  consume(a: number, b: number): void;
}

class AwaitReceiverArgIfaceBox implements AwaitReceiverArgMixer {
  callLabel: string = "";
  base: number = 0;

  constructor(callLabel: string, base: number) {
    this.callLabel = callLabel;
    this.base = base;
  }

  combine(a: number, b: number, c: number): number {
    console.log(this.callLabel);
    return this.base + a * 100 + b * 10 + c;
  }

  consume(a: number, b: number): void {
    console.log(this.callLabel);
    console.log(a + b);
  }
}

function boxPromise(label: string, callLabel: string, base: number): Promise<AwaitReceiverArgBox> {
  console.log(label);
  return Promise.resolve(new AwaitReceiverArgBox(callLabel, base));
}

function mixerPromise(label: string, callLabel: string, base: number): Promise<AwaitReceiverArgMixer> {
  console.log(label);
  const value: AwaitReceiverArgMixer = new AwaitReceiverArgIfaceBox(callLabel, base);
  return Promise.resolve(value);
}

async function declaredClass(): Promise<number> {
  const value = (await boxPromise("decl recv", "decl call", 1000)).combine(mark("decl pre", 1), await later("decl arg", 2), mark("decl post", 3));
  console.log("decl read");
  console.log(value);
  return value;
}

const arrowIface = async (): Promise<number> => {
  const value = (await mixerPromise("arrow recv", "arrow call", 2000)).combine(mark("arrow pre", 2), await later("arrow arg", 3), mark("arrow post", 4));
  console.log("arrow read");
  console.log(value);
  return value;
};

class AwaitReceiverArgRunner {
  constructor() {}

  async value(): Promise<number> {
    return (await boxPromise("method recv", "method call", 3000)).combine(await later("method left", 4), mark("method mid", 5), await later("method right", 6));
  }
}

const exprIface: () => Promise<number> = async function (): Promise<number> {
  return (await mixerPromise("expr recv", "expr call", 4000)).combine(await later("expr left", 5), mark("expr mid", 6), await later("expr right", 7));
};

async function discardClass(): Promise<void> {
  (await boxPromise("discard recv", "discard call", 0)).consume(mark("discard pre", 8), await later("discard arg", 9));
  console.log("discard after");
  return;
}

async function discardIface(): Promise<void> {
  (await mixerPromise("iface discard recv", "iface discard call", 0)).consume(await later("iface discard arg", 10), mark("iface discard post", 11));
  console.log("iface discard after");
  return;
}

declaredClass().then((n: number): void => {
  console.log("decl then");
  console.log(n);
});

arrowIface().then((n: number): void => {
  console.log("arrow then");
  console.log(n);
});

new AwaitReceiverArgRunner().value().then((n: number): void => {
  console.log("method then");
  console.log(n);
});

exprIface().then((n: number): void => {
  console.log("expr then");
  console.log(n);
});

discardClass().then((): void => {
  console.log("discard then");
});

discardIface().then((): void => {
  console.log("iface discard then");
});

console.log("sync tail");
