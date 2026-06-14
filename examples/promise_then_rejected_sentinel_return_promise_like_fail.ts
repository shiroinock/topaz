/// <reference lib="es2018.promise" />

class RejectedSentinelFailErr {}

const source: Promise<number> = Promise.reject(new RejectedSentinelFailErr());
source.then(
  undefined,
  (e: unknown): PromiseLike<string> => Promise.resolve("bad"),
);
console.log("bad");
