/// <reference lib="es2015.promise" />

class Box {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
}

async function answer(): Promise<number> {
  const box = new Box(0);
  const total = await Promise.resolve(1) + (box.value = 2) + await Promise.resolve(3);
  console.log(box.value);
  return total;
}

answer().then((value: number): void => {
  console.log(value);
});
