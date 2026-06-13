/// <reference lib="es2015.promise" />

function selectNumbers(label: string, xs: Array<number>): Array<number> {
  console.log(label);
  return xs;
}

function syncNumber(label: string, value: number): number {
  console.log(label);
  return value;
}

function asyncNumber(label: string, value: number): Promise<number> {
  console.log(label);
  return Promise.resolve(value);
}

const declaredItems: Array<number> = [];
const arrowItems: Array<number> = [];
const exprItems: Array<number> = [];

async function declared(xs: Array<number>): Promise<void> {
  selectNumbers("declared recv", xs).push(await asyncNumber("declared awaited", 1));
  console.log("declared after");
  console.log(xs.length);
  console.log(xs[0]);
}

const arrow = async (xs: Array<number>): Promise<void> => {
  selectNumbers("arrow recv", xs).push(syncNumber("arrow prefix", 10), await asyncNumber("arrow awaited", 20));
  console.log("arrow after");
  console.log(xs.length);
  console.log(xs[0]);
  console.log(xs[1]);
};

class PushRunner {
  values: Array<number> = [100];

  async add(): Promise<void> {
    this.values.push(await asyncNumber("method awaited", 30));
    console.log("method after");
    console.log(this.values.length);
    console.log(this.values[1]);
  }
}

const expr: (xs: Array<number>) => Promise<void> = async function (xs: Array<number>): Promise<void> {
  selectNumbers("expr recv", xs).push(
    syncNumber("expr prefix", 40),
    await asyncNumber("expr awaited", 50),
    syncNumber("expr suffix", 60),
  );
  console.log("expr after");
  console.log(xs.length);
  console.log(xs[0]);
  console.log(xs[1]);
  console.log(xs[2]);
};

const runner = new PushRunner();

declared(declaredItems).then((): void => {
  console.log("declared then");
  console.log(declaredItems.length);
});

arrow(arrowItems).then((): void => {
  console.log("arrow then");
  console.log(arrowItems.length);
});

runner.add().then((): void => {
  console.log("method then");
  console.log(runner.values.length);
});

expr(exprItems).then((): void => {
  console.log("expr then");
  console.log(exprItems.length);
});

console.log("sync tail");
