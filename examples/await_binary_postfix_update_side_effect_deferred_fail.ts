/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  let value = 1;
  return await Promise.resolve(10) + (value++) + await Promise.resolve(30);
}

answer();
