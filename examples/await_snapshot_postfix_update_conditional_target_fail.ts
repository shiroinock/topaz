/// <reference lib="es2015.promise" />

class Box {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

async function answer(flag: boolean): Promise<number> {
  const left = new Box(1);
  const right = new Box(2);
  return await Promise.resolve(10) + ((flag ? left : right).value++) + await Promise.resolve(30);
}

answer(true);
