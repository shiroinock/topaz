type Brand<T extends string, K extends string> = T & { readonly __brand: K };
type Score = Brand<number, "Score">;

const score: Score = 42 as Score;
console.log(score);
