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

async function answer(slot: Slot): Promise<number> {
  return await Promise.resolve(1) + (slot.value = 2) + await Promise.resolve(3);
}

answer(new Box(0));
