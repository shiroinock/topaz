/// <reference lib="es2015.promise" />

function numbersPromise(label: string, xs: Array<number>): Promise<Array<number>> {
  console.log(label);
  return Promise.resolve(xs);
}

function makeMapper(label: string, delta: number): (x: number) => number {
  console.log(label);
  return (x: number): number => {
    console.log("map callback");
    return x + delta;
  };
}

function makePredicate(label: string, min: number): (x: number) => boolean {
  console.log(label);
  return (x: number): boolean => {
    console.log("filter callback");
    return x > min;
  };
}

const numbers: Array<number> = [1, 2, 3, 4];

async function mapped(xs: Array<number>): Promise<number> {
  const ys: Array<number> = (await numbersPromise("map receiver", xs)).map(
    await Promise.resolve(makeMapper("map callback wait", 10)),
  );
  console.log("map after");
  console.log(ys.length);
  console.log(ys[0]);
  console.log(ys[3]);
  return ys.length;
}

const filtered = async (xs: Array<number>): Promise<number> => {
  const ys: Array<number> = (await numbersPromise("filter receiver", xs)).filter(
    await Promise.resolve(makePredicate("filter callback wait", 2)),
  );
  console.log("filter after");
  console.log(ys.length);
  console.log(ys[0]);
  return ys.length;
};

class Runner {
  constructor() {}

  async returned(xs: Array<number>): Promise<Array<number>> {
    return (await numbersPromise("return receiver", xs)).map(
      await Promise.resolve(makeMapper("return callback wait", 1)),
    );
  }
}

const discarded = async function (xs: Array<number>): Promise<void> {
  (await numbersPromise("discard receiver", xs)).filter(
    await Promise.resolve(makePredicate("discard callback wait", 3)),
  );
  console.log("discard after");
};

mapped(numbers).then((count: number): void => {
  console.log("map then");
  console.log(count);
});

filtered(numbers).then((count: number): void => {
  console.log("filter then");
  console.log(count);
});

new Runner().returned(numbers).then((ys: Array<number>): void => {
  console.log("return then");
  console.log(ys.length);
  console.log(ys[0]);
});

discarded(numbers).then((): void => {
  console.log("discard then");
});

console.log("sync tail");
