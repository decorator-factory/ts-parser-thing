import { Expr, LamArg, LamT, Prio } from './ast';
import { makeParser, unparse } from './parser';
import { Map } from 'immutable';


const lookupName = (name: string, env: Env): Value => {
  const rv = env.names.get(name);
  if (rv !== undefined)
    return rv;
  if (env.parent === null)
    throw new Error(`Name ${name} not found`);
  return lookupName(name, env.parent);
};


export type Env = {
  parent: Env | null;
  names: Map<string, Value>;
}


export type NativeFn = (v: Value, e: Env) => Value;


export type Value =
  | {str: string}
  | {num: number}
  | {symbol: string}
  | {fun: LamT, closure: Env}
  | {native: NativeFn, name: string}
  | {table: Map<string, Value>}
  | {bool: boolean}


const Str = (str: string): Value => ({str});
const Symbol = (symbol: string): Value => ({symbol});
const Num = (num: number): Value => ({num});
const Bool = (bool: boolean): Value => ({bool});
const Table = (table: Map<string, Value>): Value => ({table});
const Fun = (fun: LamT, closure: Env): Value => ({fun, closure});
const Native = (name: string, native: (v: Value, e: Env) => Value): Value => ({name, native});


const asNum = (v: Value): number => {
  if (!('num' in v))
    throw new Error(`Expected number, got ${JSON.stringify(v)}`);
  return v.num;
};

const asStr = (v: Value): string => {
  if (!('str' in v))
    throw new Error(`Expected string, got ${JSON.stringify(v)}`);
  return v.str;
};

const asSymb = (v: Value): string => {
  if (!('symbol' in v))
    throw new Error(`Expected string, got ${JSON.stringify(v)}`);
  return v.symbol;
};


const envRepr = (env: Env, keys: string[]): string => {
  const lines: string[] = [];
  for (const key of keys)
    lines.push(`${key}: ${prettyPrint(lookupName(key, env))}`);
  return '[' + lines.join(', ') + ']';
}


export const prettyPrint = (v: Value): string => {
  if ('str' in v)
    return JSON.stringify(v.str);
  else if ('num' in v)
    return `${v.num}`;
  else if ('fun' in v)
    return `${unparse(v.fun)} where ${envRepr(v.closure, v.fun.capturedNames)}`;
  else if ('native' in v)
    return v.name;
  else if ('symbol' in v)
    return '.' + v.symbol;
  else if ('bool' in v)
    return `${v.bool}`;
  else
    return '[' + [...v.table.entries()].map(([k, v]) => `${k}: ${prettyPrint(v)}`).join(', ') + ']'
};


export const interpret = (expr: Expr, env: Env): Value => {
  switch (expr.tag) {
    case 'num':
      return Num(expr.value);

    case 'str':
      return Str(expr.value);

    case 'symbol':
      return Symbol(expr.value);

    case 'table':
      return Table(Map(expr.pairs.map(([k, subexpr]) => [k, interpret(subexpr, env)])));

    case 'name':
      return lookupName(expr.name, env);

    case 'app':
      return applyFunction(interpret(expr.fun, env), interpret(expr.arg, env), env);

    case 'lam':
      return Fun(expr, env);

    case 'ite':
      return ifThenElse(expr.if, expr.then, expr.else, env);

  }
};


const compose = (f1: Value, f2: Value): Value =>
  Native(
    `(${prettyPrint(f1)} . ${prettyPrint(f2)})`,
    (arg: Value, env: Env) => applyFunction(f1, applyFunction(f2, arg, env), env)
  );


const GLOBAL_ENV: Env = {
  parent: null,
  names: Map({
    '+': Native('(+)', a => Native(`(${prettyPrint(a)} +)`, b => Num(asNum(a) + asNum(b)))),
    '-': Native('(-)', a => Native(`(${prettyPrint(a)} -)`, b => Num(asNum(a) - asNum(b)))),
    '*': Native('(*)', a => Native(`(${prettyPrint(a)} *)`, b => Num(asNum(a) * asNum(b)))),
    '^': Native('(^)', a => Native(`(${prettyPrint(a)} ^)`, b => Num(Math.pow(asNum(a), asNum(b))))),
    '++': Native('(++)', a => Native(`(${prettyPrint(a)} ++)`, b => Str(asStr(a) + asStr(b)))),
    '<<': Native('(<<)', a => Native(`(${prettyPrint(a)} <<)`, b => compose(a, b))),
    '>>': Native('(>>)', a => Native(`(${prettyPrint(a)} >>)`, b => compose(b, a))),
    '|>': Native('(|>)', a => Native(`(${prettyPrint(a)} |>)`, (f, env) => applyFunction(f, a, env))),
    'true': Bool(true),
    'false': Bool(false),
  })
};


export const PARSER = makeParser({
  priorities: {
    '+': Prio(6, 'left'),
    '-': Prio(6, 'left'),
    '*': Prio(8, 'left'),
    '^': Prio(10, 'right'),
    '++': Prio(10, 'left'),
    '.': Prio(1, 'right'),
  },
  namePriority: Prio(20, 'left'),
  defaultPriority: Prio(5, 'left'),
});


export const run = (expr: Expr): Value => interpret(expr, GLOBAL_ENV);


const ifThenElse = (ifExpr: Expr, thenExpr: Expr, elseExpr: Expr, env: Env): Value => {
  const condition = interpret(ifExpr, env);
  if (!('bool' in condition))
    throw new Error(`A condition must be a boolean, got ${prettyPrint(condition)}`);

  return interpret(
    condition.bool ? thenExpr : elseExpr,
    env
  );
};


const bindNames = (declaration: LamArg, value: Value, env: Env): Map<string, Value> => {
  if ('single' in declaration)
    return Map({[declaration.single]: value});

  return declaration.table.reduce(
    (acc, [src, target]) =>
      acc.concat(bindNames(
        target,
        applyFunction(value, Symbol(src), env),
        env
      )),
    Map<string, Value>()
  );
}


const applyFunction = (fun: Value, arg: Value, env: Env): Value => {
  if ('native' in fun)
    return fun.native(arg, env);

  if ('fun' in fun)
    return interpret(
      fun.fun.expr,
      {
        parent: fun.closure,
        names: bindNames(fun.fun.arg, arg, env)
      }
    );

  if ('table' in fun) {
    if (!('symbol' in arg))
      throw new Error(`Cannot index a map ${prettyPrint(fun)} with ${prettyPrint(arg)}`);
    const rv = fun.table.get(arg.symbol);
    if (rv === undefined)
      throw new Error(`Key ${arg.symbol} not found in ${prettyPrint(fun)}`);
    return rv;
  }

  throw new Error(`Trying to apply ${prettyPrint(fun)}, which isn't a function`);
};
