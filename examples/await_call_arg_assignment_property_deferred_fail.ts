/// <reference lib="es2015.promise" />

class Box {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

function combine(a: number, b: number): number {
  return a + b;
}

async function answer(): Promise<number> {
  const box: Box = new Box(0);
  return combine(await Promise.resolve(1) + (box.value = await Promise.resolve(2)), await Promise.resolve(3));
}

answer();
