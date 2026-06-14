/// <reference lib="es2018.promise" />

async function read(value: PromiseLike<number> | undefined): Promise<number> {
  if (value === undefined) {
    return 0;
  }
  const narrowed: PromiseLike<number> = value!;
  const n = await narrowed;
  return n;
}
