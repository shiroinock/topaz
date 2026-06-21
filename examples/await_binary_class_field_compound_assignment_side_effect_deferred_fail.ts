/// <reference lib="es2015.promise" />

class Box {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
}

async function answer(): Promise<number> {
  const box = new Box(1);
  return await Promise.resolve(10) + (box.value += 2) + await Promise.resolve(30);
}

answer();
