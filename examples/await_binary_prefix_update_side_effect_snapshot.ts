/// <reference lib="es2015.promise" />

class Box {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
}

async function answer(): Promise<number> {
  let value = 1;
  const localTotal = await Promise.resolve(10) + (++value) + await Promise.resolve(30);
  console.log(value);

  const box = new Box(1);
  const fieldTotal = await Promise.resolve(100) + (++box.value) + await Promise.resolve(300);
  console.log(box.value);

  return localTotal + fieldTotal;
}

answer().then((value: number): void => {
  console.log(value);
});
