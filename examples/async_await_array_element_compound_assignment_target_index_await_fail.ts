/// <reference lib="es2015.promise" />

async function nextIndex(): Promise<number> {
  return 0;
}

async function answer(): Promise<number> {
  const items: Array<number> = [1];
  items[await nextIndex()] += await Promise.resolve(2);
  return 0;
}

answer();
