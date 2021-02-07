export type Expr =
  | {tag: 'name', name: string}
  | {tag: 'app', fun: Expr, arg: Expr}
  | {tag: 'num', value: number}

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
