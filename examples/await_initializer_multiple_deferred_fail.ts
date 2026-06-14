/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const values = [await Promise.resolve(1), await Promise.resolve(2)];
  return values[0];
}

answer();
