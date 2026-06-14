/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  return (await Promise.resolve(1)) + ((await Promise.resolve(2)) + (await Promise.resolve(3)));
}

answer();
