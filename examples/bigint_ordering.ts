const largeA: bigint = 123456789012345678901234567890n;
const largeB: bigint = 123456789012345678901234567891n;

console.log(1n < 2n);
console.log(5n <= 5n);
console.log(5n >= 5n);
console.log(-10n < -2n);
console.log(largeA < largeB);
console.log(largeB > largeA);
console.log(-1n < 0n);
console.log(0n < 1n);
