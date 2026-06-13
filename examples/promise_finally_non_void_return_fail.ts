/// <reference lib="es2018.promise" />

Promise.resolve(1).finally((): number => 1);
console.log("bad");
