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

function makeBox(label: string, value: number): Box {
  console.log(label);
  return new Box(value);
}

function asSlot(box: Box): Slot {
  console.log("as slot");
  return box;
}

function makeItems(label: string, value: number): Array<number> {
  console.log(label);
  return [value];
}

function nextIndex(label: string): number {
  console.log(label);
  return 0;
}

async function answer(): Promise<number> {
  const classResult =
    await Promise.resolve(mark("left class", 1)) +
    (makeBox("make class", 10).value = mark("rhs class", 2)) +
    await Promise.resolve(mark("right class", 3));
  const interfaceResult =
    await Promise.resolve(mark("left iface", 4)) +
    (asSlot(makeBox("make iface", 20)).value = mark("rhs iface", 5)) +
    await Promise.resolve(mark("right iface", 6));
  const arrayResult =
    await Promise.resolve(mark("left array", 7)) +
    (makeItems("make array", 30)[nextIndex("index array")] = mark("rhs array", 8)) +
    await Promise.resolve(mark("right array", 9));
  const compoundResult =
    await Promise.resolve(mark("left compound", 10)) +
    (makeItems("make compound", 10)[nextIndex("index compound")] += mark("rhs compound", 11)) +
    await Promise.resolve(mark("right compound", 12));
  return classResult + interfaceResult + arrayResult + compoundResult;
}

answer().then((value: number): void => {
  console.log("then");
  console.log(value);
});

console.log("sync tail");
