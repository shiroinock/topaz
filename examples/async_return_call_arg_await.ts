/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function combine(label: string, a: number, b: number, c: number): number {
  console.log(label);
  return a * 100 + b * 10 + c;
}

class ReturnAwaitBox {
  callLabel: string = "";
  base: number = 0;

  constructor(callLabel: string, base: number) {
    this.callLabel = callLabel;
    this.base = base;
  }

  mix(a: number, b: number, c: number): number {
    console.log(this.callLabel);
    return this.base + a * 100 + b * 10 + c;
  }
}

interface ReturnAwaitMixer {
  mix(a: number, b: number, c: number): number;
}

class ReturnAwaitIfaceBox implements ReturnAwaitMixer {
  callLabel: string = "";
  base: number = 0;

  constructor(callLabel: string, base: number) {
    this.callLabel = callLabel;
    this.base = base;
  }

  mix(a: number, b: number, c: number): number {
    console.log(this.callLabel);
    return this.base + a * 100 + b * 10 + c;
  }
}

function makeBox(label: string, callLabel: string, base: number): ReturnAwaitBox {
  console.log(label);
  return new ReturnAwaitBox(callLabel, base);
}

function makeMixer(label: string, callLabel: string, base: number): ReturnAwaitMixer {
  console.log(label);
  return new ReturnAwaitIfaceBox(callLabel, base);
}

async function declared(): Promise<number> {
  return combine("declared call", mark("declared pre", 1), await Promise.resolve(2), mark("declared post", 3));
}

const arrow = async (): Promise<number> => {
  return combine("arrow call", mark("arrow pre", 4), await Promise.resolve(5), mark("arrow post", 6));
};

class ReturnAwaitRunner {
  constructor() {}

  async value(): Promise<number> {
    return makeBox("method recv", "method call", 3000).mix(
      mark("method pre", 7),
      await Promise.resolve(8),
      mark("method post", 9),
    );
  }
}

const expr: () => Promise<number> = async function (): Promise<number> {
  return makeMixer("expr recv", "expr call", 4000).mix(
    mark("expr pre", 2),
    await Promise.resolve(3),
    mark("expr post", 4),
  );
};

declared().then((n: number): void => {
  console.log("declared then");
  console.log(n);
});

arrow().then((n: number): void => {
  console.log("arrow then");
  console.log(n);
});

new ReturnAwaitRunner().value().then((n: number): void => {
  console.log("method then");
  console.log(n);
});

expr().then((n: number): void => {
  console.log("expr then");
  console.log(n);
});

console.log("sync tail");
