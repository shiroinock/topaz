/// <reference lib="es2015.promise" />

class Box {
  value: number = 0;
}

async function answer(cond: boolean): Promise<number> {
  const a = new Box();
  const b = new Box();
  return await Promise.resolve(1) + ((cond ? a : b).value = 2) + await Promise.resolve(3);
}

answer(true);
