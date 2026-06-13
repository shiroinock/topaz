/// <reference lib="es2018.promise" />

type Bad = PromiseLike<unknown>;

function read(value: Bad): void {
  console.log("bad");
}
