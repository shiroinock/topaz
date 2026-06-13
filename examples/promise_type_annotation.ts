class Ticket {
  label: string;

  constructor(label: string) {
    this.label = label;
  }
}

type PromiseStringConsumer = (p: Promise<string>) => string;

function takesNumberPromise(p: Promise<number>): string {
  return "number";
}

function takesVoidPromise(p: Promise<void>): string {
  return "void";
}

function takesArrayPromise(p: Promise<Array<number>>): string {
  return "array";
}

function takesClassPromise(p: Promise<Ticket>): string {
  return "class";
}

const consumePromiseString: PromiseStringConsumer = (p: Promise<string>): string => {
  return "consumer";
};

const ticket = new Ticket("ready");
console.log("promise annotations");
console.log(ticket.label);
