/// <reference lib="es2018.promise" />

Promise.resolve(1).then(
  (n: number): PromiseLike<number> => Promise.resolve(n + 1),
  undefined,
);
console.log("bad");
