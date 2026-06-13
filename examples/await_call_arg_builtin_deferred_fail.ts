/// <reference lib="es2015.promise" />

async function answer(): Promise<Promise<number>> {
  const p = Promise.resolve(await Promise.resolve(1));
  return p;
}

answer();
