// Block-bodied arrows still require an explicit or contextual return type.
// Inferring arbitrary block returns needs statement-flow typing, which is out
// of scope for expression-bodied arrow return inference.

const inc = (n: number) => {
  return n + 1;
};

console.log(inc(1));
