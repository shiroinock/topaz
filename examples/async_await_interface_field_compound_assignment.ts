/// <reference lib="es2015.promise" />

interface InterfaceCounter {
  saved: number;
  text: string;
}

class InterfaceCounterBox implements InterfaceCounter {
  saved: number = 10;
  text: string = "top";
}

class InterfaceHolder {
  counter: InterfaceCounter;

  constructor(counter: InterfaceCounter) {
    this.counter = counter;
  }

  async mutateMethod(): Promise<number> {
    console.log("method pre");
    this.counter.saved += await Promise.resolve(7);
    console.log("method post");
    return this.counter.saved;
  }
}

function mutateSync(counter: InterfaceCounter): void {
  console.log("sync pre");
  counter.saved += 5;
  counter.saved -= 2;
  counter.saved *= 3;
  counter.saved /= 2;
  counter.saved %= 8;
  counter.text += " sync";
  console.log(counter.saved);
  console.log(counter.text);
}

async function mutateDecl(): Promise<number> {
  const counter: InterfaceCounter = new InterfaceCounterBox();
  console.log("decl pre");
  counter.saved += await Promise.resolve(2);
  counter.saved += 1 + await Promise.resolve(3);
  counter.saved -= await Promise.resolve(4);
  counter.saved *= await Promise.resolve(5);
  counter.saved /= await Promise.resolve(3);
  counter.saved %= await Promise.resolve(6);
  console.log("decl post");
  return counter.saved;
}

const mutateArrow = async (): Promise<string> => {
  const counter: InterfaceCounter = new InterfaceCounterBox();
  console.log("arrow pre");
  counter.text += await Promise.resolve("az");
  counter.text += " " + await Promise.resolve("ok");
  console.log("arrow post");
  return counter.text;
};

const capturedCounter: InterfaceCounter = new InterfaceCounterBox();
capturedCounter.saved = 30;

const mutateExpr: () => Promise<number> = async function (): Promise<number> {
  console.log("expr pre");
  capturedCounter.saved += await Promise.resolve(4);
  console.log("expr post");
  return capturedCounter.saved;
};

mutateSync(new InterfaceCounterBox());

mutateDecl().then((n: number): void => {
  console.log("decl then");
  console.log(n);
});

mutateArrow().then((s: string): void => {
  console.log("arrow then");
  console.log(s);
});

new InterfaceHolder(new InterfaceCounterBox()).mutateMethod().then((n: number): void => {
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
