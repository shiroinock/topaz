/// <reference lib="es2015.promise" />

class KeyBox {
  constructor() {}

  key(value: string): string {
    console.log("nested key call");
    return value;
  }
}

function waitMap(label: string, map: Map<string, number>): Promise<Map<string, number>> {
  console.log(label);
  return Promise.resolve(map);
}

function waitSet(label: string, set: Set<string>): Promise<Set<string>> {
  console.log(label);
  return Promise.resolve(set);
}

function waitBox(label: string): Promise<KeyBox> {
  console.log(label);
  return Promise.resolve(new KeyBox());
}

function waitString(label: string, value: string): Promise<string> {
  console.log(label);
  return Promise.resolve(value);
}

function identity(box: KeyBox): KeyBox {
  console.log("identity call");
  return box;
}

const map: Map<string, number> = new Map<string, number>();
map.set("one", 1);

const words: Set<string> = new Set<string>();
words.add("one");

async function declared(source: Map<string, number>): Promise<number> {
  const got: number | undefined = (await waitMap("decl recv", source)).get(
    identity(await waitBox("decl box")).key(await waitString("decl key", "one")),
  );
  console.log("decl result");
  if (got !== undefined) {
    console.log(got);
    return got;
  }
  return 0;
}

async function terminal(source: Set<string>): Promise<boolean> {
  return (await waitSet("return recv", source)).has(
    identity(await waitBox("return box")).key(await waitString("return key", "one")),
  );
}

declared(map).then((value: number): void => {
  console.log("decl then");
  console.log(value);
});

terminal(words).then((ok: boolean): void => {
  console.log("return then");
  console.log(ok);
});

console.log("sync tail");
