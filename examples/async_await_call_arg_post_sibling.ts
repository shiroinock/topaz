/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function read(value: number): number {
  console.log("read call");
  console.log(value);
  return value;
}

function selectString(label: string, value: string): string {
  console.log(label);
  return value;
}

async function initializer(): Promise<number> {
  const value: number = read(await Promise.resolve(2) + mark("init post", 1));
  console.log("initializer after");
  return value;
}

async function discardStatement(): Promise<void> {
  read(await Promise.resolve(4) + mark("discard post", 5));
  console.log("discard after");
}

async function staticInitializer(): Promise<string> {
  const value: string = String.fromCharCode(await Promise.resolve(5) + mark("static post", 60));
  console.log("static after");
  console.log(value);
  return value;
}

async function terminalReturn(): Promise<number> {
  return selectString("method recv", "abcd").charCodeAt(await Promise.resolve(1) + mark("method post", 1));
}

initializer().then((value: number): void => {
  console.log("initializer then");
  console.log(value);
});

discardStatement().then((): void => {
  console.log("discard then");
});

staticInitializer().then((value: string): void => {
  console.log("static then");
  console.log(value);
});

terminalReturn().then((value: number): void => {
  console.log("terminal then");
  console.log(value);
});

console.log("sync tail");
