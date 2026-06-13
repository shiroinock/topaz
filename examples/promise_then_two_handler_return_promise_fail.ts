/// <reference lib="es2015.promise" />

class AsyncErr {}

const source: Promise<number> = Promise.reject(new AsyncErr());
source.then(
  (n: number): Promise<number> => Promise.resolve(n + 1),
  (e: unknown): number => 0,
);
console.log("bad");
