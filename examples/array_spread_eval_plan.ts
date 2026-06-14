function one(label: string, value: number): Array<number> {
  console.log(label);
  return [value];
}

const xs = [0, ...one("left", 1), 2, ...one("right", 3), 4];
console.log(xs.length);
console.log(xs[0] + xs[1] + xs[2] + xs[3] + xs[4]);
