async function answer(): Promise<number> {
  return (await Promise.resolve(42));
}

console.log(answer());
