/// <reference lib="es2015.promise" />

class AsyncErr {}

const rejected: Promise<number> = Promise.reject(new AsyncErr());
rejected.then(
  (n: number): number => n + 1,
  (e: unknown): Promise<number> => Promise.resolve(1),
);
console.log("bad");
