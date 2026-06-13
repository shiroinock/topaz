async function answer(): Promise<number> {
  plusOne(await Promise.resolve(42));
  return 43;
}

function plusOne(n: number): number {
  return n + 1;
}

answer();
