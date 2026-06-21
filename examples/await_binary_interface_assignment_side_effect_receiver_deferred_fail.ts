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

function makeSlot(): Slot {
  return new Box(0);
}

async function answer(): Promise<number> {
  return await Promise.resolve(1) + (makeSlot().value = 2) + await Promise.resolve(3);
}

answer();
