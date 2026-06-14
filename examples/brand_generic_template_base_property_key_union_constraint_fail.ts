type Brand<T extends string | number | symbol, K extends string> = T & { readonly __brand: K };
type Flag = Brand<boolean, "Flag">;

const flag: Flag = true as Flag;
console.log(flag);
