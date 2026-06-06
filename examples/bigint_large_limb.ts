const a: bigint = 123456789012345678901234567890n;
const b: bigint = 987654321098765432109876543210n;

console.log(a);
console.log(b + a);
console.log(b - a);
console.log(a * 10n);
console.log((a * b) > b);
console.log((a * b) === 121932631137021795226185032733622923332237463801111263526900n);
console.log(`${a}:${b}`);
