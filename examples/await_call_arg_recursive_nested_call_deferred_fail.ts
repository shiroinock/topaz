/// <reference lib="es2015.promise" />

function wrap(value: number): number {
  return value;
}

function combine(a: number, b: number): number {
  return a + b;
}

async function answer(): Promise<number> {
  return combine(wrap(wrap(await Promise.resolve(1))), await Promise.resolve(2));
}

answer();
