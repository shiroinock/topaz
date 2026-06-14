/// <reference lib="es2015.promise" />

function markNumber(label: string, value: number): number {
  console.log(label);
  return value;
}

function markString(label: string, value: string): string {
  console.log(label);
  return value;
}

function readNumber(label: string, value: number): number {
  console.log(label);
  console.log(value);
  return value;
}

function selectNumbers(label: string, values: Array<number>): Array<number> {
  console.log(label);
  return values;
}

async function declared(): Promise<number> {
  const value: number = readNumber("bare call", markNumber("bare pre", 1) + await Promise.resolve(2));
  console.log("declared after");
  return value;
}

async function discard(): Promise<void> {
  readNumber("discard call", markNumber("discard pre", 4) + await Promise.resolve(5));
  console.log("discard after");
}

async function staticInitializer(): Promise<string> {
  const text: string = String.fromCharCode(markNumber("char pre", 60) + await Promise.resolve(5));
  console.log("char after");
  console.log(text);
  return text;
}

async function parserInitializer(): Promise<number> {
  const value: number = parseInt(markString("parse pre", "1") + await Promise.resolve("2"), 10);
  console.log("parse after");
  console.log(value);
  return value;
}

async function methodInitializer(): Promise<boolean> {
  const values: Array<number> = [2];
  const ok: boolean = selectNumbers("includes recv", values).includes(markNumber("includes pre", 1) + await Promise.resolve(1));
  console.log("includes after");
  console.log(ok);
  return ok;
}

async function terminalReturn(): Promise<string> {
  return String.fromCharCode(markNumber("return pre", 64) + await Promise.resolve(2));
}

declared().then((value: number): void => {
  console.log("declared then");
  console.log(value);
});

discard().then((): void => {
  console.log("discard then");
});

staticInitializer().then((value: string): void => {
  console.log("static then");
  console.log(value);
});

parserInitializer().then((value: number): void => {
  console.log("parser then");
  console.log(value);
});

methodInitializer().then((value: boolean): void => {
  console.log("includes then");
  console.log(value);
});

terminalReturn().then((value: string): void => {
  console.log("return then");
  console.log(value);
});

console.log("sync tail");
