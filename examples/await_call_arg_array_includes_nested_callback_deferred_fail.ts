/// <reference lib="es2015.promise" />

class ValueFactory {
  value(fn: (x: number) => number): number {
    return fn(1);
  }
}

async function hasValue(xs: Array<number>): Promise<boolean> {
  return xs.includes(
    (await Promise.resolve(new ValueFactory())).value(await Promise.resolve((x: number): number => x + 1)),
  );
}

hasValue([1, 2, 3]);
