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

function combine(a: number, b: number): number {
  return a + b;
}

async function answer(): Promise<number> {
  const slot: Slot = new Box(0);
  return combine(await Promise.resolve(1) + (slot.value = await Promise.resolve(2)), await Promise.resolve(3));
}

answer();
