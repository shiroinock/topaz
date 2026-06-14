/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function wrap(label: string, value: number): number {
  console.log(label);
  return value;
}

function combine(a: number, b: number): number {
  return a + b;
}

async function bad(): Promise<number> {
  return combine(
    await Promise.resolve(mark("left", 1)) + wrap("snapshot", wrap("nested", await Promise.resolve(mark("inner", 2)))),
    await Promise.resolve(mark("right", 3)),
  );
}

bad();
