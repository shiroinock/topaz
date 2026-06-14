/// <reference lib="es2018.promise" />

type NumberLike = PromiseLike<number>;

async function read(value: NumberLike): Promise<number> {
  console.log("direct before");
  const n = await value;
  console.log("direct after");
  return n + 1;
}

async function readTerminal(value: NumberLike): Promise<number> {
  return await value;
}

read(Promise.resolve(10)).then((n: number): void => {
  console.log("direct then");
  console.log(n);
});

readTerminal(Promise.resolve(20)).then((n: number): void => {
  console.log("terminal then");
  console.log(n);
});

console.log("sync tail");
