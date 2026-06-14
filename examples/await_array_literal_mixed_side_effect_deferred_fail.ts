/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<Array<number>> {
  let middle = 0;
  return [await Promise.resolve(1), (middle = mark("middle", 2)), await Promise.resolve(3)];
}

answer();
