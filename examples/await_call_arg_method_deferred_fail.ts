/// <reference lib="es2015.promise" />

class CallbackFactory {
  ready: boolean;

  constructor(label: string) {
    this.ready = true;
    console.log(label);
  }

  mapper(label: string, fn: (x: number) => number): (x: number) => number {
    if (this.ready) {
      console.log(label);
    }
    return (x: number): number => {
      console.log("map callback");
      return fn(x);
    };
  }

  predicate(label: string, fn: (x: number) => boolean): (x: number) => boolean {
    if (this.ready) {
      console.log(label);
    }
    return (x: number): boolean => {
      console.log("filter callback");
      return fn(x);
    };
  }
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
  const ys: Array<number> = xs.map(
    (await Promise.resolve(new CallbackFactory("map receiver"))).mapper(
      "map materialize",
      await Promise.resolve(makeMapper("map arg", 10)),
    ),
  );
  console.log("map after");
  console.log(ys.length);
  console.log(ys[1]);
  return ys[1];
}

async function filtered(xs: Array<number>): Promise<number> {
  const ys: Array<number> = xs.filter(
    (await Promise.resolve(new CallbackFactory("filter receiver"))).predicate(
      "filter materialize",
      await Promise.resolve(makePredicate("filter arg", 2)),
    ),
  );
  console.log("filter after");
  console.log(ys.length);
  console.log(ys[0]);
  return ys.length;
}

mapped(numbers).then((value: number): void => {
  console.log("map then");
  console.log(value);
});

filtered(numbers).then((count: number): void => {
  console.log("filter then");
  console.log(count);
});

console.log("sync tail");
