/// <reference lib="es2015.promise" />

async function id<T>(value: Promise<T>): Promise<T> {
  return await value;
}

id<number>(Promise.resolve(1)).then((value: number): void => {
  console.log(value);
});
