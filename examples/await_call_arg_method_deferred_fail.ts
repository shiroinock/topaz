/// <reference lib="es2015.promise" />

class Mapper {
  callback(fn: (x: number) => number): (x: number) => number {
    return fn;
  }
}

async function answer(xs: Array<number>): Promise<number> {
  const mapped = xs.map((await Promise.resolve(new Mapper())).callback(await Promise.resolve((x: number): number => x + 1)));
  return mapped.length;
}

answer([1, 2, 3]);
