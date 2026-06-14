/// <reference lib="es2015.promise" />

function waitString(label: string, value: string): Promise<string> {
  console.log(label);
  return Promise.resolve(value);
}

async function declared(): Promise<number> {
  const n = (await waitString("decl recv", "abc")).indexOf(await waitString("decl search", "b"));
  console.log("decl result");
  console.log(n);
  return n;
}

const arrow = async (): Promise<number> => {
  return (await waitString("arrow recv", "xyz")).indexOf(await waitString("arrow search", "z"));
};

class Finder {
  constructor() {}

  async method(): Promise<number> {
    const n = (await waitString("method recv", "maple")).indexOf(await waitString("method search", "p"));
    console.log("method result");
    console.log(n);
    return n;
  }
}

const discard = async function (): Promise<void> {
  (await waitString("discard recv", "topaz")).indexOf(await waitString("discard search", "p"));
  console.log("discard after");
};

declared().then((value: number): void => {
  console.log("decl then");
  console.log(value);
});

arrow().then((value: number): void => {
  console.log("arrow then");
  console.log(value);
});

new Finder().method().then((value: number): void => {
  console.log("method then");
  console.log(value);
});

discard().then((): void => {
  console.log("discard then");
});

console.log("sync tail");
