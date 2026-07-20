/// <reference lib="es2015.promise" />

class Box {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

async function answer(maybeBox: Box | undefined): Promise<number> {
  return await Promise.resolve(10) + (maybeBox?.value++) + await Promise.resolve(30);
}

answer(new Box(1));
