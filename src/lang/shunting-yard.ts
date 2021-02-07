import { Op, Ops, Expr, App, Name, Num, ParseOptions } from './ast';


const never = (msg: string = 'This should never happen'): any => { throw new Error(msg) };


const opsToStream: (ops: Ops) => Iterable<{op: Op}|{app: Expr}> =
  function* (ops: Ops) {
    yield {app: ops.initial};
    for (const [op, app] of ops.chunks)
      yield* [{op}, {app}];
  };


  const getPriority =
  (
    operator: Op,
    options: ParseOptions
  ): number =>
    operator.type === 'name'
    ? options.namePriority
    : options.priorities[operator.value] || options.defaultPriority;


export const shuntingYard = (
  ops: Ops,
  options: ParseOptions
): Expr => {
  // https://en.wikipedia.org/wiki/Shunting-yard_algorithm
  const exprStack: Expr[] = [];
  const opStack: Op[] = [];

  const prio = (op: Op) => getPriority(op, options);
  const reduce = () => {
    const op = opStack.pop() || never();
    const right: Expr = exprStack.pop() || never();
    const left: Expr = exprStack.pop() || never();
    const app: Expr = App(App(Name(op.value), left), right);
    exprStack.push(app);
  }

  for (const item of opsToStream(ops))
    if ('app' in item)
      exprStack.push(item.app)
    else
      if (opStack.length === 0) {
        opStack.push(item.op)
      } else {
        while (opStack.length > 0 && prio(item.op) < prio(opStack.slice(-1)[0]))
          reduce();
        opStack.push(item.op);
      }
  while (opStack.length > 0)
    reduce();
  if (exprStack.length !== 1)
    never();
  return exprStack[0];
};
