/// <reference lib="es2018.promise" />

async function read(value: PromiseLike<number>): Promise<number> {
  const n = await value;
  return n;
}
