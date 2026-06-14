/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const n = (await Promise.resolve(new Combiner())).combine(wrap(await Promise.resolve(1)), await Promise.resolve(2));
  return n;
}

function wrap(value: number): number {
  return value;
}

class Combiner {
  constructor() {}

  combine(a: number, b: number): number {
    return a + b;
  }
}

answer();
