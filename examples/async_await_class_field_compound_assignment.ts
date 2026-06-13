/// <reference lib="es2015.promise" />

class FieldCompoundBox {
  saved: number = 10;
  text: string = "top";

  async mutateThis(): Promise<number> {
    console.log("this pre");
    this.saved += await Promise.resolve(2);
    this.saved += 1 + await Promise.resolve(3);
    this.saved -= await Promise.resolve(4);
    this.saved *= await Promise.resolve(5);
    this.saved /= await Promise.resolve(3);
    this.saved %= await Promise.resolve(6);
    console.log("this post");
    return this.saved;
  }

  async mutateString(): Promise<string> {
    console.log("string pre");
    this.text += await Promise.resolve("az");
    this.text += " " + await Promise.resolve("ok");
    console.log("string post");
    return this.text;
  }
}

async function objectField(): Promise<number> {
  const box = new FieldCompoundBox();
  box.saved = 20;
  console.log("object pre");
  box.saved += await Promise.resolve(4);
  box.saved *= await Promise.resolve(2);
  console.log("object post");
  return box.saved;
}

const arrowField = async (): Promise<number> => {
  const box = new FieldCompoundBox();
  box.saved = 5;
  console.log("arrow pre");
  box.saved += 1 + await Promise.resolve(6);
  console.log("arrow post");
  return box.saved;
};

const capturedBox = new FieldCompoundBox();
capturedBox.saved = 30;

const expressionField: () => Promise<number> = async function (): Promise<number> {
  console.log("expr pre");
  capturedBox.saved += await Promise.resolve(7);
  console.log("expr post");
  return capturedBox.saved;
};

new FieldCompoundBox().mutateThis().then((n: number): void => {
  console.log("this then");
  console.log(n);
});

objectField().then((n: number): void => {
  console.log("object then");
  console.log(n);
});

arrowField().then((n: number): void => {
  console.log("arrow then");
  console.log(n);
});

new FieldCompoundBox().mutateString().then((s: string): void => {
  console.log("string then");
  console.log(s);
});

expressionField().then((n: number): void => {
  console.log("expr then");
  console.log(n);
});

console.log("sync tail");
