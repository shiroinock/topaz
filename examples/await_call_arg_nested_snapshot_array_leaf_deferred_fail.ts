/// <reference lib="es2015.promise" />

type Box = { values: Array<number> };

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function wrap(label: string, value: number): number {
  console.log(label);
  return value;
}

function readBox(box: Box): number {
  return box.values[0];
}

function combine(a: number, b: number): number {
  return a + b;
}

async function bad(): Promise<number> {
  return combine(
    await Promise.resolve(mark("left", 1)) +
      wrap("snapshot", readBox({ values: [wrap("nested", await Promise.resolve(mark("inner", 2)))] })),
    await Promise.resolve(mark("right", 3)),
  );
}

bad();
