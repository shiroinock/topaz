/// <reference lib="es2015.promise" />

interface Slot {
  value: number;
}

class Box implements Slot {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<number> {
  const values: Array<number> = [1, 5];
  const slot: Slot = new Box(10);

  const normalArray = ++values[0];
  const normalInterface = --slot.value;
  console.log(normalArray);
  console.log(values[0]);
  console.log(normalInterface);
  console.log(slot.value);

  const total =
    await Promise.resolve(mark("left", 100)) +
    (++values[1]) +
    (--slot.value) +
    await Promise.resolve(mark("right", 1000));
  console.log(values[1]);
  console.log(slot.value);
  return total;
}

answer().then((value: number): void => {
  console.log(value);
});
