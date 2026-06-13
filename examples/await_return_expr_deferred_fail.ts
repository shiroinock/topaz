/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  return plusOne(await Promise.resolve(1));
}

function plusOne(n: number): number {
  return n + 1;
}

answer();
