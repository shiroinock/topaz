async function answer(): Promise<number> {
  const items: Array<number> = [0];
  items[0] += await Promise.resolve(42);
  return items[0];
}

answer();
