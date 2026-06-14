/// <reference lib="es2015.promise" />

function selectNumbers(label: string, xs: Array<number>): Array<number> {
  console.log(label);
  return xs;
}

function makeMapper(label: string, delta: number): (x: number) => number {
  console.log(label);
  return (x: number): number => x + delta;
}

function makePredicate(label: string, min: number): (x: number) => boolean {
  console.log(label);
  return (x: number): boolean => x > min;
}

const numbers: Array<number> = [1, 2, 3, 4];

async function mapped(xs: Array<number>): Promise<number> {
  const ys: Array<number> = selectNumbers("map recv", xs).map(await Promise.resolve(makeMapper("map await", 10)));
  console.log("map after");
  console.log(ys.length);
  console.log(ys[0]);
  console.log(ys[3]);
  return ys.length;
}

async function filtered(xs: Array<number>): Promise<number> {
  const ys: Array<number> = selectNumbers("filter recv", xs).filter(await Promise.resolve(makePredicate("filter await", 2)));
  console.log("filter after");
  console.log(ys.length);
  console.log(ys[0]);
  return ys.length;
}

async function returned(xs: Array<number>): Promise<Array<number>> {
  return selectNumbers("return recv", xs).map(await Promise.resolve(makeMapper("return await", 1)));
}

async function discarded(xs: Array<number>): Promise<void> {
  selectNumbers("discard recv", xs).filter(await Promise.resolve(makePredicate("discard await", 3)));
  console.log("discard after");
}

mapped(numbers).then((count: number): void => {
  console.log("map then");
  console.log(count);
});

filtered(numbers).then((count: number): void => {
  console.log("filter then");
  console.log(count);
});

returned(numbers).then((ys: Array<number>): void => {
  console.log("return then");
  console.log(ys.length);
  console.log(ys[0]);
});

discarded(numbers).then((): void => {
  console.log("discard then");
});

console.log("sync tail");
