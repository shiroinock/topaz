const nums: Array<number> = [1, 2, 2, 3];
const fromArray: Set<number> = new Set<number>(nums);
console.log(fromArray.size);
console.log(fromArray.has(2));
console.log(fromArray.has(9));

const copied: Set<number> = new Set<number>(fromArray);
fromArray.add(4);
console.log(copied.size);
console.log(copied.has(4));
console.log(fromArray.has(4));

const fromIter: Set<number> = new Set<number>(fromArray.values());
console.log(fromIter.size);
console.log(fromIter.has(4));

const words: Set<string> = new Set(["alpha", "beta", "alpha"]);
console.log(words.size);
console.log(words.has("beta"));

const empty: Set<string> = new Set();
empty.add("z");
console.log(empty.size);
console.log(empty.has("z"));
