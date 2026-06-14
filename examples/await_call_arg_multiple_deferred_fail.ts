/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const n = (await Promise.resolve(new Combiner())).combine(await Promise.resolve(1), await Promise.resolve(2));
  return n;
}

class Combiner {
  combine(a: number, b: number): number {
    return a + b;
  }
}

answer();
