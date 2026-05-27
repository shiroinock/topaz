// Phase 1.5-6 prep: receiver が class / interface でない型(scalar / Array /
// Map / Set / fn / iter / dunion 等)では destructure できない。
const xs: Array<number> = [1, 2, 3];
const { length } = xs;
console.log(length);
