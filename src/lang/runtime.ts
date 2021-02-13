import { Expr, LamArg, LamT, Prio } from './ast';
import { makeParser, unparse } from './parser';
import { Map } from 'immutable';
import { ColorHandle, identityColorHandle } from './color';


const lookupName = (name: string, env: Env): Value => {
  const rv = env.names.get(name);
  if (rv !== undefined)
    return rv;
  if (env.parent === null)
    throw new Error(`Name ${name} not found`);
  return lookupName(name, env.parent);
};

const tryLookupName = (name: string, env: Env): Value | null => {
  const rv = env.names.get(name);
  if (rv !== undefined)
    return rv;
  if (env.parent === null)
    return null;
  return tryLookupName(name, env.parent);
};


export type Env = {
  parent: Env | null;
  names: Map<string, Value>;
}


export type NativeFn = (v: Value, e: Env) => Value;

export type FunT = {fun: LamT, closure: Env};
export type LazyName = string | (() => string);
export type Value =
  | {str: string}
  | {num: number}
  | {symbol: string}
  | FunT
  | {native: NativeFn, name: LazyName}
  | {table: Map<string, Value>}
  | {bool: boolean}


export const Str = (str: string): Value => ({str});
export const Symbol = (symbol: string): Value => ({symbol});
export const Num = (num: number): Value => ({num});
export const Bool = (bool: boolean): Value => ({bool});
export const Table = (table: Map<string, Value>): Value => ({table});
export const Fun = (fun: LamT, closure: Env): Value => ({fun, closure});
export const Native = (name: LazyName, native: (v: Value, e: Env) => Value): Value => ({name, native});


export const asNum = (v: Value): number => {
  if (!('num' in v))
    throw new Error(`Expected number, got ${prettyPrint(v)}`);
  return v.num;
};

export const asStr = (v: Value): string => {
  if (!('str' in v))
    throw new Error(`Expected string, got ${prettyPrint(v)}`);
  return v.str;
};

export const asSymb = (v: Value): string => {
  if (!('symbol' in v))
    throw new Error(`Expected symbol, got ${prettyPrint(v)}`);
  return v.symbol;
};

export const asStrOrSymb = (v: Value): string => {
  if ('str' in v)
    return v.str;
  if ('symbol' in v)
    return v.symbol;
  throw new Error(`Expected string or symbol, got ${prettyPrint(v)}`);
};

export const asTable = (v: Value): Map<string, Value> => {
  if (!('table' in v))
    throw new Error(`Expected table, got ${prettyPrint(v)}`);
  return v.table;
};

export const asFun = (v: Value): FunT => {
  if (!('fun' in v))
    throw new Error(`Expected function, got ${prettyPrint(v)}`);
  return v;
};


export const envRepr = (env: Env, keys: string[], col: ColorHandle = identityColorHandle, depth: number = 0): string => {
  if (depth > 3)
    return col.bracket('[') + '...' + col.bracket(']');

  const lines: string[] = [];
  for (const key of keys){
    const v = tryLookupName(key, env);
    const vs = v === null ? "?" : prettyPrint(v, col, depth+1);
    lines.push(`${key}: ${vs}`);
  }
  return col.bracket('[') + lines.join(', ') + col.bracket(']');
}


export const prettyPrint = (v: Value, col: ColorHandle = identityColorHandle, depth: number = 0): string => {
  if (depth > 12)
    return "...";

  if ('str' in v)
    return col.str(JSON.stringify(v.str));

  else if ('num' in v)
    return col.num(`${v.num}`);

  else if ('fun' in v)
    return (v.fun.capturedNames.length === 0)
      ? `${unparse(v.fun, col, depth)}`
      : `${unparse(v.fun, col, depth)} where ${envRepr(v.closure, v.fun.capturedNames, col, depth+1)}`;

  else if ('native' in v)
    return col.native(typeof v.name === 'string' ? v.name : v.name());

  else if ('symbol' in v)
    return col.symbol('.' + v.symbol);

  else if ('bool' in v)
    return col.constant(`${v.bool}`);

  else
    return v.table.size === 0
      ? col.constant('[]')
      : (
        col.bracket('[')
        + [...v.table.entries()].map(([k, v]) => `${col.name(k)}: ${prettyPrint(v, col, depth + 1)}`).join(', ')
        + col.bracket(']')
      );
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


const ifThenElse = (ifExpr: Expr, thenExpr: Expr, elseExpr: Expr, env: Env): Value => {
  const condition = interpret(ifExpr, env);
  if (!('bool' in condition))
    throw new Error(`A condition must be a boolean, got ${prettyPrint(condition)}`);

  return interpret(
    condition.bool ? thenExpr : elseExpr,
    env
  );
};


export const bindNames = (declaration: LamArg, value: Value, env: Env): Map<string, Value> => {
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


export const applyFunction = (fun: Value, arg: Value, env: Env): Value => {
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
