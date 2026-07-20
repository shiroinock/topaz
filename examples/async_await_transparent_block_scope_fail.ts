/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  {
    const local = await Promise.resolve(42);
    console.log(local);
  }
  return local;
}

answer();
