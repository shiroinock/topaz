/// <reference lib="es2015.promise" />

class ArrayElementHolder {
  items: Array<number>;

  constructor() {
    this.items = [10, 20];
  }

  async mutateMethod(): Promise<number> {
    const index = 1;
    console.log("method pre");
    this.items[index] += await Promise.resolve(5);
    console.log("method post");
    return this.items[index];
  }
}

function mutateSync(): void {
  const items: Array<number> = [10, 4];
  let index = 0;
  console.log("sync pre");
  items[index] += 5;
  index = 1;
  items[index] -= 1;
  items[index] *= 4;
  items[index] /= 2;
  items[index] %= 5;
  const words: Array<string> = ["to"];
  words[0] += "p";
  console.log(items[0]);
  console.log(items[1]);
  console.log(words[0]);
}

async function mutateDecl(): Promise<number> {
  const items: Array<number> = [10, 3];
  const index = 0;
  console.log("decl pre");
  items[index] += await Promise.resolve(2);
  items[index] += 1 + await Promise.resolve(3);
  items[index] -= await Promise.resolve(4);
  items[index] *= await Promise.resolve(5);
  items[index] /= await Promise.resolve(3);
  items[index] %= await Promise.resolve(6);
  console.log("decl post");
  return items[index];
}

const mutateArrow = async (): Promise<string> => {
  const words: Array<string> = ["top"];
  const index = 0;
  console.log("arrow pre");
  words[index] += await Promise.resolve("az");
  words[index] += " " + await Promise.resolve("ok");
  console.log("arrow post");
  return words[index];
};

const capturedItems: Array<number> = [30];
const capturedIndex = 0;

const mutateExpr: () => Promise<number> = async function (): Promise<number> {
  console.log("expr pre");
  capturedItems[capturedIndex] += await Promise.resolve(4);
  console.log("expr post");
  return capturedItems[capturedIndex];
};

mutateSync();

mutateDecl().then((n: number): void => {
  console.log("decl then");
  console.log(n);
});

mutateArrow().then((s: string): void => {
  console.log("arrow then");
  console.log(s);
});

new ArrayElementHolder().mutateMethod().then((n: number): void => {
  console.log("method then");
  console.log(n);
});

mutateExpr().then((n: number): void => {
  console.log("expr then");
  console.log(n);
});

Promise.resolve().then((): void => {
  console.log("fifo marker");
});

console.log("sync tail");
