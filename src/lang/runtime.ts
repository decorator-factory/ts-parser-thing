import { Expr, LamArg, LamT, Prio } from './ast';
import { makeParser, unparse } from './parser';

import { Ok, Err, Either } from '../either';
import * as Ei from '../either';

import { Map } from 'immutable';
import { ColorHandle, identityColorHandle } from './color';
import Big from 'big.js';
import Fraction from 'fraction.js';
import { Dimension, makeUnit, Unit as UnitType, UnitSource } from './units';


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
  | {unit: UnitType}
  | {symbol: string}
  | FunT
  | {native: NativeFn, name: LazyName}
  | {table: Map<string, Value>}
  | {bool: boolean}


export const Str = (str: string): Value => ({str});
export const Symbol = (symbol: string): Value => ({symbol});
export const Unit = (...unit: UnitSource): Value => ({unit: makeUnit(...unit)});
export const Bool = (bool: boolean): Value => ({bool});
export const Table = (table: Map<string, Value>): Value => ({table});
export const Fun = (fun: LamT, closure: Env): Value => ({fun, closure});
export const Native = (name: LazyName, native: (v: Value, e: Env) => Partial<Value>): Value => ({name, native});
export const NativeOk = (name: LazyName, fn: (v: Value, e: Env) => Value): Value => ({name, native: (v, e) => Ok(fn(v, e))});


export type RuntimeError =
  | {type: 'unexpectedType', details: {expected: string, got: Value}}
  | {type: 'missingKey', details: {key: string}}
  | {type: 'undefinedName', details: {name: string}}
  | {type: 'dimensionMismatch', details: {left: Dimension, right: Dimension}}
  | {type: 'notInDomain', details: {domain: string, value: Value, ctx: string}}
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
export const DimensionMismatch =
  (left: Dimension, right: Dimension): RuntimeError => ({
    type: 'dimensionMismatch', details: {left, right}
  });
export const NotInDomain =
  (domain: string, value: Value, ctx: string): RuntimeError => ({
    type: 'notInDomain', details: {domain, value, ctx}
  });

export const renderRuntimeError = (err: RuntimeError): Value => {
  const details: Record<string, Value> =
    (err.type === 'unexpectedType')
    ? {expected: Str(err.details.expected), got: err.details.got}
    : (err.type === 'missingKey')
    ? {key: Str(err.details.key)}
    : (err.type === 'dimensionMismatch')
    ? {left: Unit(1, err.details.left), right: Unit(1, err.details.right)}
    : (err.type === 'notInDomain')
    ? {domain: Str(err.details.domain), value: err.details.value, ctx: Str(err.details.ctx)}
    : {name: Str(err.details.name)};
  return Table(Map({
    error: Str(err.type),
    details: Table(Map(details))
  }));
};


export type Partial<A> = Either<RuntimeError, A>;


export const asUnit = (v: Value): Partial<UnitType> => {
  if (!('unit' in v))
    return Err(UnexpectedType('unit', v));
  return Ok(v.unit);
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
    return col.punctuation('{') + '...' + col.punctuation('}');

  const lines: string[] = [];
  for (const key of keys){
    const v = tryLookupName(key, env);
    const vs = v === null ? "?" : prettyPrint(v, col, depth+1);
    lines.push(`${key}: ${vs}`);
  }
  return col.punctuation('{') + lines.join(', ') + col.punctuation('}');
}


export const prettyPrint = (v: Value, col: ColorHandle = identityColorHandle, depth: number = 0): string => {
  if (depth > 12)
    return "...";

  if ('str' in v)
    return col.str(JSON.stringify(v.str));

  else if ('unit' in v)
    return col.num(v.unit.toString());

  else if ('fun' in v)
    return (v.fun.capturedNames.length === 0)
      ? `${unparse(v.fun, col, depth)}`
      : `${unparse(v.fun, col, depth)} where ${envRepr(v.closure, v.fun.capturedNames, col, depth+1)}`;

  else if ('native' in v)
    return col.constant(typeof v.name === 'string' ? v.name : v.name());

  else if ('symbol' in v)
    return col.constant(':' + v.symbol);

  else if ('bool' in v)
    return col.constant(`${v.bool}`);

  else
    return v.table.size === 0
      ? col.constant('{}')
      : (
        col.punctuation('{')
        + [...v.table.entries()].map(([k, v]) => `${col.name(k)}: ${prettyPrint(v, col, depth + 1)}`).join(', ')
        + col.punctuation('}')
      );
};


export const interpret = (expr: Expr, env: Env): Partial<Value> => {
  switch (expr.tag) {
    case 'dec':
      return Ok(Unit(expr.value));

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


export const computeDiff = (e: Value, a: Value): string | null => {
  if ('str' in e)
    return 'str' in a
      ? (e.str === a.str ? null : `expected ${prettyPrint(e)}, got ${prettyPrint(a)}`)
      : `expected string, got ${prettyPrint(a)}`;

  if ('unit' in e)
    return 'unit' in a
    ? (e.unit.equals(a.unit) ? null : `expected ${prettyPrint(e)}, got ${prettyPrint(a)}`)
    : `expected unit, got ${prettyPrint(a)}`;

  if ('symbol' in e)
    return 'symbol' in a
      ? (e.symbol === a.symbol ? null : `expected ${prettyPrint(e)}, got ${prettyPrint(a)}`)
      : `expected symbol, got ${prettyPrint(a)}`;

  if ('bool' in e)
    return 'bool' in a
      ? (e.bool === a.bool ? null : `expected ${prettyPrint(e)}, got ${prettyPrint(a)}`)
      : `expected bool, got ${prettyPrint(a)}`;

  if ('table' in e) {
    if (!('table' in a))
      return `expected table, got ${prettyPrint(a)}`;

    const differences: [string, string][] = [];

    for (const [k, ve] of e.table.entries()) {
      const va = a.table.get(k);
      if (va === undefined) {
        differences.push([k, `missing key ${k}`])
      } else {
        const subDiff = computeDiff(va, ve);
        if (subDiff !== null)
          differences.push([k, subDiff])
      }
    }

    for (const k of a.table.keys())
      if (!e.table.has(k))
        differences.push([k, `extra key ${k}`])

    if (differences.length === 0)
      return null;

    return '{' + differences.map(([k, msg]) => `${k}: ${msg}`).join(', ') + '}';
  }

  throw new Error(`Cannot expect a function ${prettyPrint(e)}`);
}
