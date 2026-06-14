/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  let counter: number = 0;
  return combine(await Promise.resolve(1) + (counter = await Promise.resolve(2)), await Promise.resolve(3));
}

function combine(a: number, b: number): number {
  return a + b;
}

answer();
