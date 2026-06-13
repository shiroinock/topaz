/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const n = await 1;
  return n;
}

answer();
