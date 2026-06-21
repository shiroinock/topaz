/// <reference lib="es2015.promise" />

class Box {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
}

async function answer(): Promise<number> {
  const box = new Box(1);
  const total = await Promise.resolve(10) + (box.value += 2) + await Promise.resolve(30);
  console.log(box.value);
  return total;
}

answer().then((value: number): void => {
  console.log(value);
});
