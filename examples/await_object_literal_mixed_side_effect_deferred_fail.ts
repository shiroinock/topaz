/// <reference lib="es2015.promise" />

type Pair = { left: number; middle: number; right: number };

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<Pair> {
  let middle = 0;
  return {
    left: await Promise.resolve(1),
    middle: (middle = mark("middle", 2)),
    right: await Promise.resolve(3),
  };
}

answer();
