/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  {
    let total = 0;
    while (total < 1) {
      total += await Promise.resolve(1);
    }
  }
  return 42;
}

answer();
