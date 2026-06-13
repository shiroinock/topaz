/// <reference lib="es2015.promise" />

async function bad(): Promise<number> {
  const n: number = parseInt("1" + await Promise.resolve("2"), 10);
  return n;
}

bad();
