/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const a = await Promise.resolve(1);
  const b = await Promise.resolve(2);
  return a + b;
}

answer();
