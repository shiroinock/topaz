/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  return (await Promise.resolve("abc")).indexOf(await Promise.resolve("b"));
}

answer();
