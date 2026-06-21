/// <reference lib="es2015.promise" />

interface Slot {
  value: number;
}

class CounterBox {
  value: number = 10;
}

class SlotBox implements Slot {
  value: number = 20;
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function combine(label: string, sum: number, right: number, currentValue: number): number {
  console.log(label);
  console.log(sum);
  console.log(right);
  console.log(currentValue);
  return sum * 100 + right * 10 + currentValue;
}

async function mutateClass(box: CounterBox): Promise<number> {
  console.log("class rhs");
  box.value = 40;
  return 2;
}

async function mutateInterface(slot: Slot): Promise<number> {
  console.log("iface rhs");
  slot.value = 70;
  return 5;
}

async function answer(): Promise<number> {
  let local = 4;
  const localResult = combine(
    "local combine",
    0 + (local += await Promise.resolve(mark("local rhs", 6))),
    await Promise.resolve(mark("local right", 0)),
    local,
  );

  const box = new CounterBox();
  const classResult = combine(
    "class combine",
    await Promise.resolve(mark("class left", 1)) + (box.value += await mutateClass(box)),
    await Promise.resolve(mark("class right", 3)),
    box.value,
  );

  const slot: Slot = new SlotBox();
  const interfaceResult = combine(
    "iface combine",
    await Promise.resolve(mark("iface left", 2)) + (slot.value += await mutateInterface(slot)),
    await Promise.resolve(mark("iface right", 4)),
    slot.value,
  );

  return localResult + classResult + interfaceResult;
}

answer().then((value: number): void => {
  console.log("then");
  console.log(value);
});

console.log("sync tail");
