/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  return (await Promise.resolve(6)) * (await Promise.resolve(7));
}

answer();
