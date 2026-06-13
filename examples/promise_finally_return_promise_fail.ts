/// <reference lib="es2018.promise" />

Promise.resolve(1).finally((): Promise<number> => Promise.resolve(2));
console.log("bad");
