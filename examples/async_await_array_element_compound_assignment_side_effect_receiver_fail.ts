/// <reference lib="es2015.promise" />

function makeItems(): Array<number> {
  return [0];
}

async function answer(): Promise<number> {
  makeItems()[0] += await Promise.resolve(1);
  return 0;
}

answer();
