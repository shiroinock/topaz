/// <reference lib="es2018.promise" />

function wrap(value: PromiseLike<number>): Promise<PromiseLike<number>> {
  return Promise.resolve(value);
}
