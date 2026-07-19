/// <reference lib="es2015.promise" />

async function answer(maybeItems: Array<number> | undefined): Promise<number> {
  maybeItems?.[0] += await Promise.resolve(2);
  return 0;
}

answer(undefined);
