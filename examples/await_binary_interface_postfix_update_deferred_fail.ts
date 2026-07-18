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
  return await Promise.resolve(10) + (slot.value++) + await Promise.resolve(30);
}

answer();
