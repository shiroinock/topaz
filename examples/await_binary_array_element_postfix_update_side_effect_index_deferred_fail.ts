/// <reference lib="es2015.promise" />

function nextIndex(): number {
  return 0;
}

async function answer(): Promise<number> {
  const values: Array<number> = [1];
  return await Promise.resolve(10) + (values[nextIndex()]++) + await Promise.resolve(30);
}

answer();
