/// <reference lib="es2015.promise" />

function first<T>(left: T, right: T): T {
  return left;
}

class Box<T> {
  value(value: T): T {
    return value;
  }
}

async function unsupported<T>(left: Promise<T>, right: Promise<T>, box: Promise<Box<T>>): Promise<T> {
  return first<T>((await box).value(await left), await right);
}

unsupported<number>(Promise.resolve(1), Promise.resolve(2), Promise.resolve(new Box<number>())).then((value: number): void => {
  console.log(value);
});
