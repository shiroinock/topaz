// 空 `{}` は anon class として「全 field の集合 = ∅」になり、ctor も 0 引数で
// 既存の auto-zero-arg ctor と区別がつかなくなる(field 0 の sentinel struct
// は明示用途まで保留)。Phase 1.5-6 prep では reject。
type Empty = {};
const e: Empty = {};
console.log(0);
