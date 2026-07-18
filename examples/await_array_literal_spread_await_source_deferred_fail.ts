/// <reference lib="es2015.promise" />

function items(value: number): Array<number> {
  return [value];
}

async function answer(): Promise<number> {
  const values: Array<number> = [
    ...items(await Promise.resolve(0)),
    await Promise.resolve(1),
    await Promise.resolve(2),
  ];
  return values[0];
}

answer();
