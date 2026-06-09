// Phase 3.14: spread arguments are supported only for Array.push.

interface Named {
  name(): string;
}

class Tag implements Named {
  label: string;
  constructor(label: string) {
    this.label = label;
  }
  name(): string {
    return this.label;
  }
}

const src: Array<number> = [1, 2, 3];
const dst: Array<number> = [4];
dst.push(...src);
console.log(dst.length);
let dstSum: number = 0;
for (const n of dst) dstSum = dstSum + n;
console.log(dstSum);

const mixed: Array<number> = [1, 2, 3, 4];
const tail: Array<number> = [5, 6];
mixed.push(7, ...tail, 8);
console.log(mixed.length);
let mixedSum: number = 0;
for (const n of mixed) mixedSum = mixedSum + n;
console.log(mixedSum);

const self: Array<number> = [9, 10];
self.push(...self);
console.log(self.length);
let selfSum: number = 0;
for (const n of self) selfSum = selfSum + n;
console.log(selfSum);

const named: Array<Named> = [new Tag("aa")];
const tags: Array<Tag> = [new Tag("b"), new Tag("ccc"), new Tag("dddd")];
named.push(...tags);
console.log(named.length);
let nameTotal: number = 0;
for (const n of named) nameTotal = nameTotal + n.name().length;
console.log(nameTotal);
