import { Expr, LamArg, LamT, Prio } from './ast';
import { makeParser, unparse } from './parser';

import { Ok, Err, Either } from '../either';
import * as Ei from '../either';

import { Map } from 'immutable';
import { ColorHandle, identityColorHandle } from './color';


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


export type NativeFn = (v: Value, e: Env) => Partial<Value>;

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
export const Native = (name: LazyName, native: (v: Value, e: Env) => Partial<Value>): Value => ({name, native});
export const NativeOk = (name: LazyName, fn: (v: Value, e: Env) => Value): Value => ({name, native: (v, e) => Ok(fn(v, e))});


export type RuntimeError =
  | {type: 'unexpectedType', details: {expected: string, got: Value}}
  | {type: 'missingKey', details: {key: string}}
  | {type: 'undefinedName', details: {name: string}}
  ;
export const UnexpectedType =
  (expected: string, got: Value): RuntimeError => ({
    type: 'unexpectedType', details: {expected, got}
  });
export const MissingKey =
  (key: string): RuntimeError => ({
    type: 'missingKey', details: {key}
  });
export const UndefinedName =
  (name: string): RuntimeError => ({
    type: 'undefinedName', details: {name}
  });


export const renderRuntimeError = (err: RuntimeError): Value => {
  const details: any =
    (err.type === 'unexpectedType')
    ? {expected: Str(err.details.expected), got: err.details.got}
    : (err.type === 'missingKey')
    ? {key: Str(err.details.key)}
    : {name: Str(err.details.name)};
  return Table(Map({
    error: Str(err.type),
    details: Table(Map(details))
  }));
};


export type Partial<A> = Either<RuntimeError, A>;


export const asNum = (v: Value): Partial<number> => {
  if (!('num' in v))
    return Err(UnexpectedType('number', v));
  return Ok(v.num);
};

export const asStr = (v: Value): Partial<string> => {
  if (!('str' in v))
    return Err(UnexpectedType('string', v));
  return Ok(v.str);
};

export const asSymb = (v: Value): Partial<string> => {
  if (!('symbol' in v))
    return Err(UnexpectedType('symbol', v));
  return Ok(v.symbol);
};

export const asStrOrSymb = (v: Value): Partial<string> => {
  if ('str' in v)
    return Ok(v.str);
  if ('symbol' in v)
    return Ok(v.symbol);
  return Err(UnexpectedType('string|symbol', v));
};

export const asTable = (v: Value): Partial<Map<string, Value>> => {
  if (!('table' in v))
    return Err(UnexpectedType('table', v));
  return Ok(v.table);
};

export const asFun = (v: Value): Partial<FunT> => {
  if (!('fun' in v))
    return Err(UnexpectedType('function', v));
  return Ok(v);
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


export const interpret = (expr: Expr, env: Env): Partial<Value> => {
  switch (expr.tag) {
    case 'num':
      return Ok(Num(expr.value));

    case 'str':
      return Ok(Str(expr.value));

    case 'symbol':
      return Ok(Symbol(expr.value));

    case 'table': {
      const rv: [string, Value][] = [];
      for (const [k, subexpr] of expr.pairs) {
        const subresult = interpret(subexpr, env);
        if ('err' in subresult)
          return subresult;
        rv.push([k, subresult.ok]);
      }
      return Ok(Table(Map(rv)));
    }

    case 'name': {
      const result = tryLookupName(expr.name, env);
      if (result === null)
        return Err(UndefinedName(expr.name));
      return Ok(result);
    };

    case 'app':
      return Ei.flatMap(
        interpret(expr.fun, env),
        fun => Ei.flatMap(
          interpret(expr.arg, env),
          arg => applyFunction(fun, arg, env)
        )
      );

    case 'lam':
      return Ok(Fun(expr, env));

    case 'ite':
      return ifThenElse(expr.if, expr.then, expr.else, env);

  }
};


const ifThenElse = (ifExpr: Expr, thenExpr: Expr, elseExpr: Expr, env: Env): Partial<Value> => {
  const condition = interpret(ifExpr, env);
  if ('err' in condition)
    return condition;
  if (!('bool' in condition.ok))
    return Err(UnexpectedType('boolean', condition.ok));

  return interpret(
    condition.ok.bool ? thenExpr : elseExpr,
    env
  );
};


export const bindNames = (declaration: LamArg, argument: Value, env: Env): Partial<[string, Value][]> => {
  if ('single' in declaration)
    return Ok([[declaration.single, argument]]);

  const rv: [string, Value][] = [];

  for (const [src, target] of declaration.table) {
    const newBindings =
      Ei.flatMap(
        applyFunction(argument, Symbol(src), env),
        subBinding => bindNames(target, subBinding, env)
      );
    if ('err' in newBindings)
      return newBindings;
    rv.push(...newBindings.ok);
  }

  return Ok(rv);
}


export const applyFunction = (fun: Value, arg: Value, env: Env): Partial<Value> => {
  if ('native' in fun)
    return fun.native(arg, env);

  if ('fun' in fun)
    return Ei.flatMap(
      bindNames(fun.fun.arg, arg, env),
      boundNames =>
        interpret(
          fun.fun.expr,
          {
            parent: fun.closure,
            names: Map(boundNames),
          }
        )
    );

  if ('table' in fun) {
    if (!('symbol' in arg))
      return Err(UnexpectedType('symbol', arg));
    const rv = fun.table.get(arg.symbol);
    if (rv === undefined)
      return Err(MissingKey(arg.symbol));
    return Ok(rv);
  }

  return Err(UnexpectedType('table|function|native', fun));
};
