/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function combine(a: number, b: number): number {
  return a + b;
}

async function answer(): Promise<number> {
  return combine(
    await Promise.resolve(1) + mark("left tail", 2) + await Promise.resolve(3),
    await Promise.resolve(4) + mark("right tail", 5) + await Promise.resolve(6),
  );
}

answer();
