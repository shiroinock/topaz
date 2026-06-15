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

class Holder {
  slot: Slot;

  constructor(slot: Slot) {
    this.slot = slot;
  }
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function replaceSlot(holder: Holder, label: string, value: number): number {
  console.log(label);
  holder.slot = new Box(100);
  return value;
}

function combine(sum: number, right: number, originalValue: number, currentValue: number): number {
  console.log("combine");
  console.log(sum);
  console.log(right);
  console.log(originalValue);
  console.log(currentValue);
  return sum * 1000 + right * 100 + originalValue * 10 + currentValue;
}

async function answer(): Promise<number> {
  const original: Slot = new Box(10);
  const holder: Holder = new Holder(original);
  return combine(
    await Promise.resolve(mark("left", 1)) + (holder.slot.value = await Promise.resolve(replaceSlot(holder, "rhs replace", 2))),
    await Promise.resolve(mark("right", 3)),
    original.value,
    holder.slot.value,
  );
}

answer().then((value: number): void => {
  console.log("then");
  console.log(value);
});

console.log("sync tail");
