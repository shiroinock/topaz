/// <reference lib="es2015.promise" />

function first<T>(left: T, right: T): T {
  return left;
}

async function unsupported<T>(left: Promise<T>, right: Promise<T>): Promise<T> {
  return first<T>(await left, await right);
}

unsupported<number>(Promise.resolve(1), Promise.resolve(2)).then((value: number): void => {
  console.log(value);
});
