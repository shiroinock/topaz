/// <reference lib="es2015.promise" />

async function answer(xs: Array<number>): Promise<number> {
  const mapped = xs.map(await Promise.resolve((x: number): number => x + 1));
  return mapped.length;
}

answer([1, 2, 3]);
