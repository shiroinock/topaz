type Box<T = string> = {
  readonly value: T;
};

type StringBox = Box<string>;
const value: StringBox = { value: "u1" };
console.log(value.value);
