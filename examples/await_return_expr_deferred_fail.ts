/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<Array<Array<number>>> {
  return [[await Promise.resolve(1), mark("middle", 2), await Promise.resolve(3)]];
}

answer();
