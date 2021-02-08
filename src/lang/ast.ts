export type Expr =
  | {tag: 'name', name: string}
  | {tag: 'app', fun: Expr, arg: Expr}
  | {tag: 'num', value: number}
  | {tag: 'str', value: string}
  | {tag: 'symbol', value: string}
  | {tag: 'table', pairs: [string, Expr][] }
  | {tag: 'ite', if: Expr, then: Expr, else: Expr}
  | LamT

export type LamT =
  {tag: 'lam', argName: string, expr: Expr, capturedNames: string[]};

export type Op = {type: 'infix' | 'name', value: string}

export type Ops = {initial: Expr, chunks: [Op, Expr][]}

export type Priority = {strength: number, direction: 'left' | 'right'};
export const Prio = (
  strength: number,
  direction: 'left' | 'right'
): Priority =>
  ({strength, direction});

export type ParseOptions = {
  priorities: Record<string, Priority>,
  namePriority: Priority,  // priority for (a `f` b `g` c)
  defaultPriority: Priority
}

export const App =
  (fun: Expr, arg: Expr): Expr =>
    ({tag: 'app', fun, arg});

export const Name =
  (name: string): Expr =>
    ({tag: 'name', name});

export const Num =
  (value: number): Expr =>
    ({tag: 'num', value});

export const Str =
(value: string): Expr =>
  ({tag: 'str', value});

export const Symbol =
(value: string): Expr =>
  ({tag: 'symbol', value});

export const Table =
  (pairs: [string, Expr][]): Expr =>
    ({tag: 'table', pairs});

export const Lam =
  (argName: string, expr: Expr): Expr =>
    ({tag: 'lam', argName, expr, capturedNames: getCapturedNames(expr, [argName])});

export const IfThenElse =
(ifE: Expr, thenE: Expr, elseE: Expr): Expr =>
  ({tag: 'ite', if: ifE, then: thenE, else: elseE});


const _getCapturedNames = (expr: Expr, exclude: string[]): string[] => {
  switch (expr.tag) {
    case 'name':
      return exclude.includes(expr.name) ? [] : [expr.name];

    case 'app':
      return (
        _getCapturedNames(expr.fun, exclude)
        .concat(_getCapturedNames(expr.arg, exclude))
      );

    case 'num':
      return [];

    case 'str':
      return [];

    case 'symbol':
      return [];

    case 'table':
      return expr.pairs.flatMap(([_, subexpr]) => _getCapturedNames(subexpr, exclude));

    case 'lam':
      return expr.capturedNames.filter(name => !exclude.includes(name));

    case 'ite':
      return [
        ..._getCapturedNames(expr.if, exclude),
        ..._getCapturedNames(expr.then, exclude),
        ..._getCapturedNames(expr.else, exclude)
      ];
  }
}


const unique =
  <T>(arr: ReadonlyArray<T>): Array<T> =>
  [...new Set(arr)];

const getCapturedNames =
  (expr: Expr, exclude: string[]): string[] =>
  unique(_getCapturedNames(expr, exclude));
