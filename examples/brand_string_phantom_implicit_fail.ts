type UserId = string & { readonly __brand: "UserId" };

const id: UserId = "u1";
console.log(id);
