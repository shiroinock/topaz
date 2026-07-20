/// <reference lib="es2015.promise" />

class Box {
  value: number = 0;
}

async function makeBox(): Promise<Box> {
  return new Box();
}

async function answer(): Promise<number> {
  return await Promise.resolve(1) + ((await makeBox()).value = 2) + await Promise.resolve(3);
}

answer();
