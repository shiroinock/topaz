type Tagged<T, Tag = never> = T & { readonly __tag: Tag };
type OrderId = Tagged<string>;
type OrderIdExplicit = Tagged<string, never>;
type InvoiceId = Tagged<string, "InvoiceId">;

function revealOrder(id: OrderId): string {
  return id;
}

function sameOrder(id: OrderId): OrderIdExplicit {
  return id;
}

function revealInvoice(id: InvoiceId): string {
  return id;
}

const orderId: OrderId = "o1" as OrderId;
const explicit: OrderIdExplicit = orderId;
const defaulted: OrderId = explicit;
const invoiceId: InvoiceId = "i1" as InvoiceId;
const rawOrder: string = defaulted;
const ids: Array<OrderId> = [orderId, sameOrder(orderId)];

console.log(revealOrder(orderId));
console.log(rawOrder);
console.log(sameOrder(orderId));
console.log(orderId === explicit);
console.log(rawOrder === revealOrder(explicit));
console.log(ids[1]);
console.log(revealInvoice(invoiceId));
