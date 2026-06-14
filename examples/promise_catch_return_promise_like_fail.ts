/// <reference lib="es2018.promise" />

class AsyncLikeErr {}

const rejected: Promise<number> = Promise.reject(new AsyncLikeErr());
rejected.catch((e: unknown): PromiseLike<string> => Promise.resolve("bad"));
console.log("bad");
