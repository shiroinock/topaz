/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function combine(label: string, a: number, b: number, c: number): number {
  console.log(label);
  return a * 100 + b * 10 + c;
}

async function declared(): Promise<number> {
  const value = combine("declared call", mark("declared pre", 1), await Promise.resolve(2), mark("declared post", 3));
  console.log("declared read");
  console.log(value);
  return value;
}

const arrow = async (): Promise<number> => {
  const value = combine("arrow call", mark("arrow pre", 4), await Promise.resolve(5), mark("arrow post", 6));
  console.log("arrow read");
  console.log(value);
  return value;
};

class AsyncCallArgBox {
  base: number = 0;

  async value(): Promise<number> {
    let value = combine("method call", mark("method pre", 7), await Promise.resolve(8), mark("method post", 9));
    console.log("method read");
    console.log(value);
    return value;
  }
}

const expr: () => Promise<number> = async function (): Promise<number> {
  const value = combine("expr call", mark("expr pre", 2), await Promise.resolve(3), mark("expr post", 4));
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

new AsyncCallArgBox().value().then((n: number): void => {
  console.log("method then");
  console.log(n);
});

expr().then((n: number): void => {
  console.log("expr then");
  console.log(n);
});

console.log("sync tail");
