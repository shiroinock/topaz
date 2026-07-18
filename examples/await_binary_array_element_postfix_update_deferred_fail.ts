/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const values = [1];
  return await Promise.resolve(10) + (values[0]++) + await Promise.resolve(30);
}

answer();
