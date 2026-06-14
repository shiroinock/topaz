/// <reference lib="es2015.promise" />

async function answer(xs: Promise<Array<number>>): Promise<number> {
  const mapped = (await xs).map(await Promise.resolve((x: number): number => x + 1));
  return mapped.length;
}

answer(Promise.resolve([1, 2, 3]));
