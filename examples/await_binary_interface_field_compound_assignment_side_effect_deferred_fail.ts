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

async function answer(): Promise<number> {
  const slot: Slot = new Box(1);
  const total = await Promise.resolve(10) + (slot.value += 2) + await Promise.resolve(30);
  console.log(slot.value);
  return total;
}

answer().then((value: number): void => {
  console.log(value);
});
