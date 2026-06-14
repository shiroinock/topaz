/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  return (await Promise.resolve(true)) && (await Promise.resolve(false));
}

answer();
