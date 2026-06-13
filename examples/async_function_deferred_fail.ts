async function answer(): Promise<number> {
  let saved = 0;
  saved += await Promise.resolve(42);
  return saved;
}

answer();
