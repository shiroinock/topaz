/// <reference lib="es2015.promise" />

function waitMap(label: string, map: Map<string, number>): Promise<Map<string, number>> {
  console.log(label);
  return Promise.resolve(map);
}

function waitSet(label: string, set: Set<string>): Promise<Set<string>> {
  console.log(label);
  return Promise.resolve(set);
}

function waitString(label: string, value: string): Promise<string> {
  console.log(label);
  return Promise.resolve(value);
}

const numbers: Map<string, number> = new Map<string, number>();
numbers.set("one", 10);
numbers.set("two", 20);

const words: Set<string> = new Set<string>();
words.add("red");
words.add("blue");

async function declared(source: Map<string, number>): Promise<number> {
  const got: number | undefined = (await waitMap("decl recv", source)).get(await waitString("decl key", "one"));
  console.log("decl result");
  if (got !== undefined) {
    console.log(got);
    return got;
  }
  return 0;
}

const arrow = async (source: Map<string, number>): Promise<boolean> => {
  return (await waitMap("arrow recv", source)).has(await waitString("arrow key", "two"));
};

class CollectionReceiverRunner {
  owned: Set<string> = new Set<string>();

  constructor() {
    this.owned.add("red");
    this.owned.add("blue");
  }

  async method(): Promise<boolean> {
    const ok: boolean = (await waitSet("method recv", this.owned)).has(await waitString("method value", "red"));
    console.log("method result");
    console.log(ok);
    return ok;
  }
}

const discard = async function (source: Set<string>): Promise<void> {
  (await waitSet("discard recv", source)).delete(await waitString("discard value", "blue"));
  console.log("discard after");
  console.log(source.has("blue"));
};

declared(numbers).then((n: number): void => {
  console.log("decl then");
  console.log(n);
});

arrow(numbers).then((ok: boolean): void => {
  console.log("arrow then");
  console.log(ok);
});

new CollectionReceiverRunner().method().then((ok: boolean): void => {
  console.log("method then");
  console.log(ok);
});

discard(words).then((): void => {
  console.log("discard then");
});

console.log("sync tail");
