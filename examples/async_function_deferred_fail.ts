async function answer(): Promise<number> {
  return (await Promise.resolve(42)) + 1;
}

console.log(answer());
