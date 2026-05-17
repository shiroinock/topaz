let n: number = 1024;
let count: number = 0;
while (n > 1) {
  n = n / 2;
  count = count + 1;
}
console.log(count);
