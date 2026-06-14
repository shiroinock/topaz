/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const box = new Combiner();
  const n = box.combine(await Promise.resolve(1), await Promise.resolve(2));
  return n;
}

class Combiner {
  combine(a: number, b: number): number {
    return a + b;
  }
}

answer();
