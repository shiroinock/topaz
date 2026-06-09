// Phase 3.14: Array.push spread sources must have element types that can flow
// into the destination Array element type.
const dst: Array<number> = [];
const src: Array<string> = ["x"];
dst.push(...src);
