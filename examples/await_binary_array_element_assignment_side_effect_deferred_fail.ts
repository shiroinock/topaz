/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const values: Array<number> = [0];
  return await Promise.resolve(1) + (values[0] = 2) + await Promise.resolve(3);
}

answer();
