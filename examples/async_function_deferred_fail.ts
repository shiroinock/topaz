async function answer(): number {
  return (await Promise.resolve(42));
}

console.log(answer());
