/// <reference lib="es2015.promise" />

function selectMap(label: string, map: Map<string, number>): Map<string, number> {
  console.log(label);
  return map;
}

function selectSet(label: string, set: Set<string>): Set<string> {
  console.log(label);
  return set;
}

const numbers: Map<string, number> = new Map<string, number>();
numbers.set("one", 10);
numbers.set("two", 20);

const words: Set<string> = new Set<string>();
words.add("red");
words.add("blue");

async function declared(source: Map<string, number>): Promise<number> {
  const got: number | undefined = selectMap("declared get recv", source).get(await Promise.resolve("one"));
  console.log("declared after");
  if (got !== undefined) {
    console.log(got);
    return got;
  }
  return 0;
}

const arrow = async (source: Map<string, number>): Promise<boolean> => {
  const ok: boolean = selectMap("arrow has recv", source).has(await Promise.resolve("two"));
  console.log("arrow after");
  console.log(ok);
  return ok;
};

class CollectionAwaitRunner {
  owned: Set<string> = new Set<string>();

  constructor() {
    this.owned.add("red");
    this.owned.add("blue");
  }

  async hasRed(): Promise<boolean> {
    const ok: boolean = selectSet("method has recv", this.owned).has(await Promise.resolve("red"));
    console.log("method after");
    console.log(ok);
    return ok;
  }
}

const expr: (source: Map<string, number>) => Promise<boolean> = async function (source: Map<string, number>): Promise<boolean> {
  return selectMap("expr return recv", source).has(await Promise.resolve("two"));
};

async function removeBlue(source: Set<string>): Promise<boolean> {
  return selectSet("delete return recv", source).delete(await Promise.resolve("blue"));
}

declared(numbers).then((n: number): void => {
  console.log("declared then");
  console.log(n);
});

arrow(numbers).then((ok: boolean): void => {
  console.log("arrow then");
  console.log(ok);
});

new CollectionAwaitRunner().hasRed().then((ok: boolean): void => {
  console.log("method then");
  console.log(ok);
});

expr(numbers).then((ok: boolean): void => {
  console.log("expr then");
  console.log(ok);
});

removeBlue(words).then((ok: boolean): void => {
  console.log("delete then");
  console.log(ok);
});

console.log("sync tail");
