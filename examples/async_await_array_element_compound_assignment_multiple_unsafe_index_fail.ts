/// <reference lib="es2015.promise" />

function nextIndex(): number {
  return 0;
}

async function answer(): Promise<number> {
  const items: Array<number> = [0];
  return (items[0 + nextIndex()] += (await Promise.resolve(1)) + (await Promise.resolve(2)));
}

answer();
