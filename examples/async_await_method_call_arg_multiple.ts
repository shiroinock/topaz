/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

class MultiAwaitMethodBox {
  callLabel: string = "";
  base: number = 0;

  constructor(callLabel: string, base: number) {
    this.callLabel = callLabel;
    this.base = base;
  }

  combine(a: number, b: number, c: number, d: number, e: number): number {
    console.log(this.callLabel);
    return this.base + a * 10000 + b * 1000 + c * 100 + d * 10 + e;
  }

  consume(a: number, b: number, c: number, d: number, e: number): void {
    console.log(this.callLabel);
    console.log(a + b + c + d + e);
  }
}

interface MultiAwaitMethodCombiner {
  combine(a: number, b: number, c: number, d: number, e: number): number;
}

class MultiAwaitMethodIfaceBox implements MultiAwaitMethodCombiner {
  callLabel: string = "";
  base: number = 0;

  constructor(callLabel: string, base: number) {
    this.callLabel = callLabel;
    this.base = base;
  }

  combine(a: number, b: number, c: number, d: number, e: number): number {
    console.log(this.callLabel);
    return this.base + a * 10000 + b * 1000 + c * 100 + d * 10 + e;
  }
}

function makeBox(label: string, callLabel: string, base: number): MultiAwaitMethodBox {
  console.log(label);
  return new MultiAwaitMethodBox(callLabel, base);
}

function makeMixer(label: string, callLabel: string, base: number): MultiAwaitMethodCombiner {
  console.log(label);
  return new MultiAwaitMethodIfaceBox(callLabel, base);
}

async function declared(): Promise<number> {
  const value = makeBox("decl recv", "decl call", 100000).combine(mark("decl pre", 1), await Promise.resolve(2), mark("decl mid", 3), await Promise.resolve(4), mark("decl post", 5));
  console.log("decl read");
  console.log(value);
  return value;
}

const arrow = async (): Promise<number> => {
  const value = makeMixer("arrow recv", "arrow call", 200000).combine(mark("arrow pre", 2), await Promise.resolve(3), mark("arrow mid", 4), await Promise.resolve(5), mark("arrow post", 6));
  console.log("arrow read");
  console.log(value);
  return value;
};

class MultiAwaitMethodRunner {
  constructor() {}

  async value(): Promise<number> {
    const value = makeBox("method recv", "method call", 300000).combine(mark("method pre", 3), await Promise.resolve(4), mark("method mid", 5), await Promise.resolve(6), mark("method post", 7));
    console.log("method read");
    console.log(value);
    return value;
  }
}

const expr: () => Promise<number> = async function (): Promise<number> {
  const value = makeMixer("expr recv", "expr call", 400000).combine(mark("expr pre", 4), await Promise.resolve(5), mark("expr mid", 6), await Promise.resolve(7), mark("expr post", 8));
  console.log("expr read");
  console.log(value);
  return value;
};

async function terminal(): Promise<number> {
  return makeBox("return recv", "return call", 500000).combine(mark("return pre", 5), await Promise.resolve(6), mark("return mid", 7), await Promise.resolve(8), mark("return post", 9));
}

async function discardOnly(): Promise<void> {
  makeBox("discard recv", "discard call", 0).consume(mark("discard pre", 1), await Promise.resolve(2), mark("discard mid", 3), await Promise.resolve(4), mark("discard post", 5));
  console.log("discard after");
  return;
}

declared().then((n: number): void => {
  console.log("decl then");
  console.log(n);
});

arrow().then((n: number): void => {
  console.log("arrow then");
  console.log(n);
});

new MultiAwaitMethodRunner().value().then((n: number): void => {
  console.log("method then");
  console.log(n);
});

expr().then((n: number): void => {
  console.log("expr then");
  console.log(n);
});

terminal().then((n: number): void => {
  console.log("return then");
  console.log(n);
});

discardOnly().then((): void => {
  console.log("discard then");
});

console.log("sync tail");
