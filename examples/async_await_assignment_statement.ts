/// <reference lib="es2015.promise" />

async function declared(): Promise<number> {
  let saved = 0;
  console.log("declared pre");
  saved = await Promise.resolve(11);
  console.log("declared post");
  return saved;
}

const arrow = async (value: number): Promise<number> => {
  let saved = 0;
  console.log("arrow pre");
  saved = await Promise.resolve(value);
  console.log("arrow post");
  return saved;
};

class AssignmentAwaitBox {
  saved: number = 30;

  async method(delta: number): Promise<number> {
    console.log("method pre");
    this.saved = await Promise.resolve(this.saved + delta);
    console.log("method post");
    return this.saved;
  }
}

let savedExpr = 0;
const expr: () => Promise<number> = async function (): Promise<number> {
  console.log("expr pre");
  savedExpr = await Promise.resolve(44);
  console.log("expr post");
  return savedExpr;
};

async function arraySlot(): Promise<number> {
  let values = [0, 0];
  console.log("array pre");
  values[1] = await Promise.resolve(66);
  console.log("array post");
  return values[1];
}

declared().then((n: number): void => {
  console.log("declared then");
  console.log(n);
});

arrow(22).then((n: number): void => {
  console.log("arrow then");
  console.log(n);
});

new AssignmentAwaitBox().method(5).then((n: number): void => {
  console.log("method then");
  console.log(n);
});

expr().then((n: number): void => {
  console.log("expr then");
  console.log(n);
});

arraySlot().then((n: number): void => {
  console.log("array then");
  console.log(n);
});

console.log("sync tail");
