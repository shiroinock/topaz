/// <reference lib="es2015.promise" />

async function makeItems(): Promise<Array<number>> {
  return [1];
}

async function answer(): Promise<number> {
  (await makeItems())[0] += await Promise.resolve(2);
  return 0;
}

answer();
