/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

class AwaitMethodBox {
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

interface AwaitMethodMixer {
  mix(a: number, b: number, c: number): number;
}

class AwaitMethodIfaceBox implements AwaitMethodMixer {
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

function makeBox(label: string, callLabel: string, base: number): AwaitMethodBox {
  console.log(label);
  return new AwaitMethodBox(callLabel, base);
}

function makeMixer(label: string, callLabel: string, base: number): AwaitMethodMixer {
  console.log(label);
  return new AwaitMethodIfaceBox(callLabel, base);
}

async function declared(): Promise<number> {
  const value = makeBox("declared recv", "declared call", 1000).mix(
    mark("declared pre", 1),
    await Promise.resolve(2),
    mark("declared post", 3),
  );
  console.log("declared read");
  console.log(value);
  return value;
}

const arrow = async (): Promise<number> => {
  const value = makeMixer("arrow recv", "arrow call", 2000).mix(
    mark("arrow pre", 4),
    await Promise.resolve(5),
    mark("arrow post", 6),
  );
  console.log("arrow read");
  console.log(value);
  return value;
};

class AwaitMethodRunner {
  constructor() {}

  async value(): Promise<number> {
    let value = makeBox("method recv", "method call", 3000).mix(
      mark("method pre", 7),
      await Promise.resolve(8),
      mark("method post", 9),
    );
    console.log("method read");
    console.log(value);
    return value;
  }
}

const expr: () => Promise<number> = async function (): Promise<number> {
  const value = makeMixer("expr recv", "expr call", 4000).mix(
    mark("expr pre", 2),
    await Promise.resolve(3),
    mark("expr post", 4),
  );
  console.log("expr read");
  console.log(value);
  return value;
};

declared().then((n: number): void => {
  console.log("declared then");
  console.log(n);
});

arrow().then((n: number): void => {
  console.log("arrow then");
  console.log(n);
});

new AwaitMethodRunner().value().then((n: number): void => {
  console.log("method then");
  console.log(n);
});

expr().then((n: number): void => {
  console.log("expr then");
  console.log(n);
});

console.log("sync tail");
