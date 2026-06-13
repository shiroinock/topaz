/// <reference lib="es2018.promise" />

Promise.resolve(1).finally((n: number): void => {
  console.log(n);
});
console.log("bad");
