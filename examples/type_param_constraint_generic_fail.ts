function id<T extends string>(value: T): T {
  return value;
}

console.log(id<string>("u1"));
