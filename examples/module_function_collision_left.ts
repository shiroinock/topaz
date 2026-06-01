function sameName(n: number): number {
  return n + 10;
}

export function leftValue(n: number): number {
  return sameName(n);
}

export function leftFnValue(n: number): number {
  const f: (x: number) => number = sameName;
  return f(n);
}
