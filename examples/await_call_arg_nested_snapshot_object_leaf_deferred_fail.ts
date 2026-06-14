/// <reference lib="es2015.promise" />

interface Box {
  value: number;
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function wrap(label: string, value: number): number {
  console.log(label);
  return value;
}

function readBox(box: Box): number {
  return box.value;
}

function combine(a: number, b: number): number {
  return a + b;
}

async function bad(): Promise<number> {
  return combine(
    await Promise.resolve(mark("left", 1)) +
      wrap("snapshot", readBox({ value: wrap("nested", await Promise.resolve(mark("inner", 2))) })),
    await Promise.resolve(mark("right", 3)),
  );
}

bad();
