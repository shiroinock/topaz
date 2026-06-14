/// <reference lib="es2018.promise" />

type NumberLike = PromiseLike<number>;

function assignBridge(value: NumberLike): Promise<number> {
  const p: Promise<number> = Promise.resolve(value);
  return p;
}

function returnBridge(value: NumberLike): Promise<number> {
  return Promise.resolve(value);
}

assignBridge(Promise.resolve(10)).then((n: number): void => {
  console.log("assign");
  console.log(n + 1);
});

const local: NumberLike = Promise.resolve(20);
returnBridge(local).then((n: number): void => {
  console.log("return");
  console.log(n + 2);
});

console.log("sync tail");
