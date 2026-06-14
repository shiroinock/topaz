/// <reference lib="es2018.promise" />

async function read(values: Array<PromiseLike<number>>): Promise<number> {
  const first: PromiseLike<number> = values[0];
  const n = await first;
  return n;
}
