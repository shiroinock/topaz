/// <reference lib="es2015.promise" />

class AsyncErr {}

const rejected: Promise<number> = Promise.reject(new AsyncErr());
rejected.catch((e: unknown): Promise<string> => Promise.resolve("bad"));
console.log("bad");
