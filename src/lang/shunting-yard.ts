/**
 * The shunting yard algorithm is an algorithm for parsing
 * infix operator notation into reverse polish notation (and
 * consequently into a tree structure).
 *
 * You can find a detailed explanation of the algorithm here:
 * https://en.wikipedia.org/wiki/Shunting-yard_algorithm
 */


import { matchExhaustive } from '@practical-fp/union-types';
import { Op, Ops, Expr, App, Name, ParseOptions, Priority } from './ast';


const never = <T>(msg: string = 'This should never happen'): T => { throw new Error(msg) };


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
): Priority =>
  matchExhaustive(operator, {
    ExprOp: () => options.backtickPriority,
    InfixOp: name => options.priorities[name] || options.defaultPriority
  });




export const shuntingYard = (
  ops: Ops,
  options: ParseOptions
): Expr => {
  const app = (fun: Expr, arg: Expr) => App({fun, arg});

  const exprStack: Expr[] = [];
  const opStack: Op[] = [];

  const prio = (op: Op) => getPriority(op, options);

  const reduce = () => {
    const op = opStack.pop() || never<Op>();
    const right: Expr = exprStack.pop() || never<Expr>();
    const left: Expr = exprStack.pop() || never<Expr>();
    const application: Expr =
      matchExhaustive(op, {
        ExprOp: expr => app(app(expr, left), right),
        InfixOp: name => app(app(Name(name), left), right),
      });
    exprStack.push(application);
  }

  for (const item of opsToStream(ops))
    if ('app' in item) {
      exprStack.push(item.app)
    } else {
      if (opStack.length === 0) {
        opStack.push(item.op)
      } else {
        while (true) {
          if (opStack.length === 0)
            break;
          const myPrio = prio(item.op);
          const topPrio = prio(opStack.slice(-1)[0])
          if (!(
            (myPrio.strength < topPrio.strength)
            || (myPrio.strength === topPrio.strength && myPrio.direction === 'left')
          ))
            break;
          reduce();
        }
        opStack.push(item.op);
      }
    }

  while (opStack.length > 0)
    reduce();

  if (exprStack.length !== 1)
    never();

  return exprStack[0];
};
