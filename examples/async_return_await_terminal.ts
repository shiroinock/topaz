/// <reference lib="es2015.promise" />

async function declared(): Promise<number> {
  return await Promise.resolve(10);
}

const arrow = async (base: number): Promise<number> => {
  const a = await Promise.resolve(20);
  return await Promise.resolve(a + base);
};

class Box {
  base: number = 3;

  async method(delta: number): Promise<number> {
    return await Promise.resolve(this.base + delta);
  }
}

const captured = 4;
const expr: () => Promise<number> = async function (): Promise<number> {
  return await Promise.resolve(captured + 1);
};

declared().then((n: number): void => {
  console.log("declared");
  console.log(n);
});

arrow(2).then((n: number): void => {
  console.log("arrow");
  console.log(n);
});

new Box().method(5).then((n: number): void => {
  console.log("method");
  console.log(n);
});

expr().then((n: number): void => {
  console.log("expr");
  console.log(n);
});

console.log("sync tail");
