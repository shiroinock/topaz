/// <reference lib="es2015.promise" />

class AsyncErr {}

const rejected: Promise<number> = Promise.reject(new AsyncErr());
rejected.catch();
console.log("bad");
