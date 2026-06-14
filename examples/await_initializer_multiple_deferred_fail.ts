/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const prefix: Array<number> = [0];
  const values: Array<number> = [...prefix, await Promise.resolve(1), await Promise.resolve(2)];
  return values[0];
}

answer();
