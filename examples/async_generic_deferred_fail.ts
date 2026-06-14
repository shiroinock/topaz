/// <reference lib="es2015.promise" />

function first<T>(left: T, right: T): T {
  return left;
}

function wrap<T>(value: T): T {
  return value;
}

async function unsupported<T>(left: Promise<T>, right: Promise<T>): Promise<T> {
  return first<T>(await left, wrap<T>(wrap<T>(await right)));
}

unsupported<number>(Promise.resolve(1), Promise.resolve(2)).then((value: number): void => {
  console.log(value);
});
