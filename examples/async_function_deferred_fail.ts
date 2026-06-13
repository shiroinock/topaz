async function answer(): Promise<number> {
  return plusOne(await Promise.resolve(42));
}

function plusOne(n: number): number {
  return n + 1;
}

answer();
