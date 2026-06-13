/// <reference lib="es2015.promise" />

async function answer(): Promise<void> {
  console.log(await Promise.resolve("x"));
}

answer();
