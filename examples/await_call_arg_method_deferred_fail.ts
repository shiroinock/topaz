/// <reference lib="es2015.promise" />

class Box {
  plus(n: number): number {
    return n + 1;
  }
}

async function answer(): Promise<number> {
  const n = new Box().plus(await Promise.resolve(1));
  return n;
}

answer();
