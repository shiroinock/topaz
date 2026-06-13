/// <reference lib="es2018.promise" />

const key: Promise<number> = Promise.resolve(1);
const values: Map<Promise<number>, string> = new Map<Promise<number>, string>();
console.log("bad");
