async function id<T>(value: T): Promise<T> {
  return value;
}

console.log(id<number>(1));
