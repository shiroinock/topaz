/// <reference lib="es2018.promise" />

type Bad = Iterator<Array<Promise<number>>>;

function read(values: Bad): void {
  console.log("bad");
}
