/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  return await Promise.resolve(1);
  console.log("unreachable");
}

answer();
