let saved = 0;

async function answer(): Promise<number> {
  saved = await Promise.resolve(42);
  return saved;
}

answer();
