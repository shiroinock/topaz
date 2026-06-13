/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const items: Array<number> = [0];
  items[0] += await Promise.resolve("bad");
  return items[0];
}

answer();
