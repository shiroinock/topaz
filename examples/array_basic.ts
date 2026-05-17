let xs: number[] = [10, 20, 30];
console.log(xs.length);
console.log(xs[0]);
console.log(xs[2]);

xs.push(40);
xs.push(50);
console.log(xs.length);
console.log(xs[3]);
console.log(xs[4]);

xs[0] = 99;
console.log(xs[0]);

let last: number = xs.pop();
console.log(last);
console.log(xs.length);

let total: number = 0;
for (let i: number = 0; i < xs.length; i++) {
  total += xs[i];
}
console.log(total);

let ys: Array<boolean> = [true, false, true];
console.log(ys[0]);
console.log(ys[1]);

let zs: Array<string> = ["alpha", "beta"];
zs.push("gamma");
console.log(zs[0]);
console.log(zs[2]);
console.log(zs.length);

let empty: number[] = [];
empty.push(7);
console.log(empty.length);
console.log(empty[0]);
