/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const a = await Promise.resolve(1);
  if (a === 1) {
    return await Promise.resolve(2);
  }
  return a;
}

answer();
