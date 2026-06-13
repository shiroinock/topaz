/// <reference lib="es2015.promise" />

async function declaredLog(): Promise<void> {
  console.log("declared pre");
  console.log(await Promise.resolve("declared log"));
  console.log("declared after");
  return;
}

const arrowError = async (): Promise<void> => {
  console.log("arrow pre");
  console.error(await Promise.resolve("arrow error"));
  console.log("arrow after");
  return;
};

class SyntheticCallRunner {
  constructor() {}

  async warn(): Promise<void> {
    console.log("method pre");
    console.warn(await Promise.resolve("method warn"));
    console.log("method after");
    return;
  }
}

const exprReturnChar: () => Promise<string> = async function (): Promise<string> {
  console.log("expr pre");
  return String.fromCharCode(await Promise.resolve(65));
};

async function initializerChar(): Promise<string> {
  console.log("initializer pre");
  const ch: string = String.fromCharCode(await Promise.resolve(66));
  console.log("initializer char");
  console.log(ch);
  return ch;
}

async function discardChar(): Promise<void> {
  console.log("discard pre");
  String.fromCharCode(await Promise.resolve(67));
  console.log("discard after");
  return;
}

declaredLog().then((): void => {
  console.log("declared then");
});

arrowError().then((): void => {
  console.log("arrow then");
});

new SyntheticCallRunner().warn().then((): void => {
  console.log("method then");
});

exprReturnChar().then((ch: string): void => {
  console.log("expr then");
  console.log(ch);
});

initializerChar().then((ch: string): void => {
  console.log("initializer then");
  console.log(ch);
});

discardChar().then((): void => {
  console.log("discard then");
});

console.log("sync tail");
