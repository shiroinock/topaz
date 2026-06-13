/// <reference lib="es2015.promise" />

function selectString(label: string, value: string): string {
  console.log(label);
  return value;
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function declared(source: string): Promise<number> {
  const code: number = selectString("declared char recv", source).charCodeAt(await Promise.resolve(1));
  console.log("declared after");
  console.log(code);
  return code;
}

const arrow = async (source: string): Promise<string> => {
  const part: string = selectString("arrow slice recv", source).slice(await Promise.resolve(2));
  console.log("arrow after");
  console.log(part);
  return part;
};

class StringAwaitRunner {
  base: string = "abcdef";

  async sliceMiddle(): Promise<string> {
    const part: string = selectString("method slice recv", this.base).slice(mark("method pre", 1), await Promise.resolve(4));
    console.log("method after");
    console.log(part);
    return part;
  }
}

const expr: (source: string) => Promise<string> = async function (source: string): Promise<string> {
  const repeated: string = selectString("expr repeat recv", source).repeat(await Promise.resolve(3));
  console.log("expr after");
  console.log(repeated);
  return repeated;
};

async function starts(source: string): Promise<boolean> {
  const ok: boolean = selectString("starts recv", source).startsWith(await Promise.resolve("ab"));
  console.log("starts after");
  console.log(ok);
  return ok;
}

async function terminalSlice(source: string): Promise<string> {
  return selectString("return slice recv", source).slice(await Promise.resolve(3));
}

declared("abcdef").then((n: number): void => {
  console.log("declared then");
  console.log(n);
});

arrow("abcdef").then((part: string): void => {
  console.log("arrow then");
  console.log(part);
});

new StringAwaitRunner().sliceMiddle().then((part: string): void => {
  console.log("method then");
  console.log(part);
});

expr("xy").then((part: string): void => {
  console.log("expr then");
  console.log(part);
});

starts("abcdef").then((ok: boolean): void => {
  console.log("starts then");
  console.log(ok);
});

terminalSlice("abcdef").then((part: string): void => {
  console.log("return then");
  console.log(part);
});

console.log("sync tail");
