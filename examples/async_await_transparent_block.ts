/// <reference lib="es2015.promise" />

async function blockFunction(): Promise<number> {
  console.log("function prefix");
  {
    const local = 5;
    console.log("function block before");
    const first = await Promise.resolve(10);
    {
      const local = 7;
      await Promise.resolve();
      console.log("function nested");
      console.log(local);
    }
    const second = await Promise.resolve(local + first);
    console.log("function block after");
    console.log(second);
  }
  console.log("function suffix");
  return 42;
}

const blockArrow = async (): Promise<number> => {
  {
    console.log("arrow before");
    const value = await Promise.resolve(20);
    console.log("arrow after");
    console.log(value);
  }
  return 43;
};

class BlockMethod {
  constructor() {}

  async value(): Promise<number> {
    {
      console.log("method before");
      const value = await Promise.resolve(30);
      console.log("method after");
      console.log(value);
    }
    return 44;
  }
}

const blockExpression: () => Promise<number> = async function (): Promise<number> {
  {
    console.log("expression before");
    const value = await Promise.resolve(40);
    console.log("expression after");
    console.log(value);
  }
  return 45;
};

blockFunction().then((value: number): void => {
  console.log("function then");
  console.log(value);
});
blockArrow().then((value: number): void => {
  console.log("arrow then");
  console.log(value);
});
new BlockMethod().value().then((value: number): void => {
  console.log("method then");
  console.log(value);
});
blockExpression().then((value: number): void => {
  console.log("expression then");
  console.log(value);
});

console.log("sync tail");
