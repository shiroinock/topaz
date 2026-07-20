/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const values: Array<number> = [1];
  return await Promise.resolve(10) + (++(await Promise.resolve(values))[0]) + await Promise.resolve(30);
}

answer();
