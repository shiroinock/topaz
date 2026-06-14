/// <reference lib="es2015.promise" />

function markNumber(label: string, value: number): number {
  console.log(label);
  return value;
}

function markString(label: string, value: string): string {
  console.log(label);
  return value;
}

async function declared(): Promise<void> {
  (await Promise.resolve(markNumber("decl left", 10))) + (await Promise.resolve(markNumber("decl right", 1)));
  console.log("decl done");
}

const arrow = async (): Promise<void> => {
  (await Promise.resolve(markNumber("arrow left", 20))) + (await Promise.resolve(markNumber("arrow right", 2)));
  console.log("arrow done");
};

class AsyncStatementBinaryBox {
  constructor() {}

  async value(): Promise<void> {
    (await Promise.resolve(markString("method left", "m"))) + (await Promise.resolve(markString("method right", "!")));
    console.log("method done");
  }
}

const expr: () => Promise<void> = async function (): Promise<void> {
  (await Promise.resolve(markString("expr left", "x"))) + (await Promise.resolve(markString("expr right", "y")));
  console.log("expr done");
};

declared().then((): void => {
  console.log("decl then");
});

arrow().then((): void => {
  console.log("arrow then");
});

new AsyncStatementBinaryBox().value().then((): void => {
  console.log("method then");
});

expr().then((): void => {
  console.log("expr then");
});

console.log("sync tail");
