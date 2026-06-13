type Phantom<K> = { readonly __brand: K };
type Marker = Phantom<"UserId">;

const marker: Marker = "u1" as Marker;
console.log(marker);
