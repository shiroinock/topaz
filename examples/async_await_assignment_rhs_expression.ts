/// <reference lib="es2015.promise" />

async function localAssignment(): Promise<number> {
  let saved = 0;
  console.log("local pre");
  saved = 1 + await Promise.resolve(2);
  console.log("local post");
  return saved;
}

function makeExpressionAssignment(): () => Promise<number> {
  let savedExpr = 10;
  return async function (): Promise<number> {
    console.log("expr pre");
    savedExpr = savedExpr + await Promise.resolve(5);
    console.log("expr post");
    return savedExpr;
  };
}

class AssignmentRhsExpressionBox {
  saved: number = 20;

  async bump(delta: number): Promise<number> {
    console.log("method pre");
    this.saved = this.saved + await Promise.resolve(delta);
    console.log("method post");
    return this.saved;
  }
}

async function stringAssignment(): Promise<string> {
  let value = "a";
  console.log("string pre");
  value = value + await Promise.resolve("b");
  console.log("string post");
  return value;
}

localAssignment().then((n: number): void => {
  console.log("local then");
  console.log(n);
});

const expr = makeExpressionAssignment();
expr().then((n: number): void => {
  console.log("expr then");
  console.log(n);
});

new AssignmentRhsExpressionBox().bump(7).then((n: number): void => {
  console.log("method then");
  console.log(n);
});

stringAssignment().then((s: string): void => {
  console.log("string then");
  console.log(s);
});

console.log("sync tail");
