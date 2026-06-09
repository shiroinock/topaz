const n: number = 41;

console.log((123).toString());
console.log((0).toString());
console.log((-12).toString());
console.log((1e21).toString());
console.log((3.14).toString());
console.log((0.1 + 0.2).toString());
console.log((n + 1).toString());

const label: string = "n=" + (n + 1).toString();
console.log(label);
console.log(label.length);

const fixedTmps: Array<string> = ["a", "b", "c"];
console.log(fixedTmps.length.toString());
