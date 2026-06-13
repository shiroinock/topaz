/// <reference lib="es2015.promise" />

async function declared(): Promise<number> {
  console.log("declared pre");
  await Promise.resolve(10);
  console.log("declared middle");
  await Promise.resolve();
  console.log("declared post");
  return 11;
}

const arrow = async (value: number): Promise<number> => {
  console.log("arrow pre");
  await Promise.resolve(value);
  console.log("arrow post");
  return value + 20;
};

class AwaitStatementBox {
  base: number = 5;

  async method(delta: number): Promise<number> {
    console.log("method pre");
    await Promise.resolve(this.base + delta);
    console.log("method post");
    return this.base + delta;
  }
}

const captured = 4;
const expr: () => Promise<number> = async function (): Promise<number> {
  console.log("expr pre");
  await Promise.resolve();
  console.log("expr post");
  return captured + 4;
};

declared().then((n: number): void => {
  console.log("declared then");
  console.log(n);
});

arrow(2).then((n: number): void => {
  console.log("arrow then");
  console.log(n);
});

new AwaitStatementBox().method(3).then((n: number): void => {
  console.log("method then");
  console.log(n);
});

expr().then((n: number): void => {
  console.log("expr then");
  console.log(n);
});

console.log("sync tail");
