async function answer(): Promise<number> {
  if (await Promise.resolve(true)) {
    return 42;
  }
  return 0;
}

answer();
