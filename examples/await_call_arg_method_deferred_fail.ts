/// <reference lib="es2015.promise" />

class Box {
  values: Array<number> = [1, 2, 3];
}

async function answer(): Promise<number> {
  const yes = new Box().values.includes(await Promise.resolve(1));
  if (yes) return 1;
  return 0;
}

answer();
