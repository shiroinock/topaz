/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  try {
    const n = await Promise.resolve(1);
    return n;
  } catch (e: unknown) {
    return 0;
  }
}

answer();
