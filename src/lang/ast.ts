export type Expr =
  | {tag: 'name', name: string}
  | {tag: 'app', fun: Expr, arg: Expr}
  | {tag: 'num', value: number}
  | {tag: 'str', value: string}
  | LamT

export type LamT =
  {tag: 'lam', argName: string, expr: Expr, capturedNames: string[]};

export type Op = {type: 'symbol' | 'name', value: string}

export type Ops = {initial: Expr, chunks: [Op, Expr][]}

export type ParseOptions = {
  priorities: Record<string, number>,
  namePriority: number,
  defaultPriority: number
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

export const Lam =
  (argName: string, expr: Expr): Expr =>
    ({tag: 'lam', argName, expr, capturedNames: getCapturedNames(expr, [argName])});

const getCapturedNames = (expr: Expr, exclude: string[]): string[] => {
  switch (expr.tag) {
    case 'name':
      return exclude.includes(expr.name) ? [] : [expr.name];

    case 'app':
      return (
        getCapturedNames(expr.fun, exclude)
        .concat(getCapturedNames(expr.arg, exclude))
      );

    case 'num':
      return [];

    case 'str':
      return [];

    case 'lam':
      return expr.capturedNames.filter(name => !exclude.includes(name));
  }
}
