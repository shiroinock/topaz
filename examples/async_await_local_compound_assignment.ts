/// <reference lib="es2015.promise" />

async function localNumber(): Promise<number> {
  let saved = 10;
  console.log("local pre");
  saved += await Promise.resolve(2);
  saved += 1 + await Promise.resolve(3);
  saved -= await Promise.resolve(4);
  saved *= await Promise.resolve(5);
  saved /= await Promise.resolve(3);
  saved %= await Promise.resolve(6);
  console.log("local post");
  return saved;
}

const arrowNumber = async (): Promise<number> => {
  let value = 1;
  console.log("arrow pre");
  value += await Promise.resolve(4);
  console.log("arrow post");
  return value;
};

class LocalCompoundBox {
  seed: number = 0;

  async value(): Promise<number> {
    let local = this.seed + 3;
    console.log("method pre");
    local *= await Promise.resolve(7);
    console.log("method post");
    return local;
  }
}

function makeCaptured(): () => Promise<number> {
  let captured = 30;
  return async function (): Promise<number> {
    console.log("expr pre");
    captured += await Promise.resolve(12);
    console.log("expr post");
    return captured;
  };
}

async function stringValue(): Promise<string> {
  let text = "top";
  console.log("string pre");
  text += await Promise.resolve("az");
  text += " " + await Promise.resolve("ok");
  console.log("string post");
  return text;
}

localNumber().then((n: number): void => {
  console.log("local then");
  console.log(n);
});

arrowNumber().then((n: number): void => {
  console.log("arrow then");
  console.log(n);
});

new LocalCompoundBox().value().then((n: number): void => {
  console.log("method then");
  console.log(n);
});

const captured = makeCaptured();
captured().then((n: number): void => {
  console.log("expr then");
  console.log(n);
});

stringValue().then((s: string): void => {
  console.log("string then");
  console.log(s);
});

console.log("sync tail");
