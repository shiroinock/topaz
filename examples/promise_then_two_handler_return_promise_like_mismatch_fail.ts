/// <reference lib="es2018.promise" />

class AsyncErr {}

const source: Promise<number> = Promise.reject(new AsyncErr());
source.then(
  (n: number): PromiseLike<number> => Promise.resolve(n + 1),
  (e: unknown): PromiseLike<string> => Promise.resolve("bad"),
);
console.log("bad");
