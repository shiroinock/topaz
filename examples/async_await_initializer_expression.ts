/// <reference lib="es2015.promise" />

async function declared(): Promise<number> {
  const base = await Promise.resolve(20);
  const value = base + (await Promise.resolve(21));
  let total = value + (await Promise.resolve(1));
  return total;
}

const arrow = async (extra: number): Promise<number> => {
  const base = await Promise.resolve(10);
  const value = base + (await Promise.resolve(11));
  return value + extra;
};

class AsyncInitializerBox {
  base: number = 5;

  async value(delta: number): Promise<number> {
    const base = await Promise.resolve(this.base);
    let value = base + (await Promise.resolve(delta));
    return value + 1;
  }
}

const captured = 3;
const expr: () => Promise<number> = async function (): Promise<number> {
  const base = await Promise.resolve(captured);
  const value = base + (await Promise.resolve(4));
  return value + 1;
};

declared().then((n: number): void => {
  console.log("declared");
  console.log(n);
});

arrow(1).then((n: number): void => {
  console.log("arrow");
  console.log(n);
});

new AsyncInitializerBox().value(6).then((n: number): void => {
  console.log("method");
  console.log(n);
});

expr().then((n: number): void => {
  console.log("expr");
  console.log(n);
});

console.log("sync tail");
