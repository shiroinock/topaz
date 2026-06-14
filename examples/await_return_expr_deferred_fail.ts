/// <reference lib="es2015.promise" />

async function answer(): Promise<Array<number>> {
  return [await Promise.resolve(1), await Promise.resolve(2)];
}

answer();
