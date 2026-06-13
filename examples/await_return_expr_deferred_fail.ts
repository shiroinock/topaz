/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const n = (await Promise.resolve(1)) + 1;
  return n;
}

answer();
