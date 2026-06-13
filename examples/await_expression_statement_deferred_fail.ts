/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  await Promise.resolve(1);
  return 0;
}

answer();
