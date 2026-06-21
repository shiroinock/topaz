/// <reference lib="es2015.promise" />

function pickIndex(): number {
  return 0;
}

async function answer(): Promise<number> {
  const values: Array<number> = [0];
  return await Promise.resolve(1) + (values[pickIndex()] = 2) + await Promise.resolve(3);
}

answer();
