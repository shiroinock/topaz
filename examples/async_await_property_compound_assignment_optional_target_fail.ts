/// <reference lib="es2015.promise" />

class OptionalTargetBox {
  value: number = 0;
}

async function answer(maybeBox: OptionalTargetBox | undefined): Promise<number> {
  maybeBox?.value += await Promise.resolve(1);
  return 0;
}

answer(undefined);
