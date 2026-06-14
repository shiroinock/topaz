/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  return combine(snapshot(wrap(await Promise.resolve(1))) + await Promise.resolve(2), await Promise.resolve(3));
}

function wrap(value: number): number {
  return value;
}

function snapshot(value: number): number {
  return value;
}

function combine(a: number, b: number): number {
  return a + b;
}

answer();
