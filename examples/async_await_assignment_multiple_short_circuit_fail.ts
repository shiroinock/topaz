/// <reference lib="es2015.promise" />

async function answer(): Promise<boolean> {
  let saved = false;
  return (saved = (await Promise.resolve(true)) && (await Promise.resolve(false)));
}

answer();
