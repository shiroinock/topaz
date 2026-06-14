/// <reference lib="es2015.promise" />

class Box {
  value(value: number): number {
    return value;
  }
}

function combine(a: number, b: number): number {
  return a + b;
}

async function answer(): Promise<number> {
  return combine((await Promise.resolve(new Box())).value(await Promise.resolve(1)), await Promise.resolve(2));
}

answer();
