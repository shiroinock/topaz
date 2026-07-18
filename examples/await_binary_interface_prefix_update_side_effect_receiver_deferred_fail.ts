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
  return new Box(1);
}

async function answer(): Promise<number> {
  return await Promise.resolve(10) + (++makeSlot().value) + await Promise.resolve(30);
}

answer();
