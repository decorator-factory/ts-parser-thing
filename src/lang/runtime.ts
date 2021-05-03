import { Expr, Lam, LamArg, Lambda } from './ast';
import { unparse } from './parser';

import { Ok, Err, Either } from '../either';
import * as Ei from '../either';

import { Map } from 'immutable';
import { ColorHandle, identityColorHandle } from './color';
import { Dimension, makeUnit, Unit as UnitType, UnitSource } from './units';
import { impl, match, matchExhaustive, Variant } from '@practical-fp/union-types';


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

export type FunT = {fun: Lambda, closure: Env};
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
export const Fun = (fun: Lambda, closure: Env): Value => ({fun, closure});
export const Native = (name: LazyName, native: (v: Value, e: Env) => Partial<Value>): Value => ({name, native});
export const NativeOk = (name: LazyName, fn: (v: Value, e: Env) => Value): Value =>
  ({name, native: (v, e) => Ok(fn(v, e))});


export type RuntimeError =
  | Variant<'UnexpectedType', {expected: string, got: Value}>
  | Variant<'MissingKey', string>
  | Variant<'UndefinedName', string>
  | Variant<'DimensionMismatch', {left: Dimension, right: Dimension}>
  | Variant<'NotInDomain', {value: Value, explanation: string}>


export const {
  UnexpectedType,
  MissingKey,
  UndefinedName,
  DimensionMismatch,
  NotInDomain,
} = impl<RuntimeError>();


export const renderRuntimeError = (error: RuntimeError): Value => {
  const details: Record<string, Value> =
    matchExhaustive(error, {
      UnexpectedType: ({expected, got}) => ({expected: Str(expected), got}),
      MissingKey: key => ({key: Str(key)}),
      UndefinedName: name => ({name: Str(name)}),
      DimensionMismatch: ({left, right}) => ({left: Unit(1, left), right: Unit(1, right)}),
      NotInDomain: ({value, explanation}) => ({value, explanation: Str(explanation)})
    });
  return Table(Map({
    error: Str(error.tag),
    details: Table(Map(details))
  }));
};


export type Partial<A> = Either<RuntimeError, A>;


export const asUnit = (v: Value): Partial<UnitType> => {
  if (!('unit' in v))
    return Err(UnexpectedType({expected: 'unit', got: v}));
  return Ok(v.unit);
};

export const asStr = (v: Value): Partial<string> => {
  if (!('str' in v))
    return Err(UnexpectedType({expected: 'string', got: v}));
  return Ok(v.str);
};

export const asSymb = (v: Value): Partial<string> => {
  if (!('symbol' in v))
    return Err(UnexpectedType({expected: 'symbol', got: v}));
  return Ok(v.symbol);
};

export const asStrOrSymb = (v: Value): Partial<string> => {
  if ('str' in v)
    return Ok(v.str);
  if ('symbol' in v)
    return Ok(v.symbol);
  return Err(UnexpectedType({expected: 'string|symbol', got: v}));
};

export const asTable = (v: Value): Partial<Map<string, Value>> => {
  if (!('table' in v))
    return Err(UnexpectedType({expected: 'table', got: v}));
  return Ok(v.table);
};

export const asFun = (v: Value): Partial<FunT> => {
  if (!('fun' in v))
    return Err(UnexpectedType({expected: 'function', got: v}));
  return Ok(v);
};


export const envRepr = (
  env: Env,
  keys: string[],
  col: ColorHandle = identityColorHandle,
  depth: number = 0
): string => {
  if (depth > 3)
    return col.punctuation('{') + '...' + col.punctuation('}');

  const lines: string[] = [];
  for (const key of keys){
    const v = tryLookupName(key, env);
    const vs = v === null ? '?' : prettyPrint(v, col, depth+1);
    lines.push(`${key}: ${vs}`);
  }
  return col.punctuation('{') + lines.join(', ') + col.punctuation('}');
}


export const prettyPrint = (value: Value, col: ColorHandle = identityColorHandle, depth: number = 0): string => {
  if (depth > 12)
    return '...';

  if ('str' in value)
    return col.str(JSON.stringify(value.str));

  else if ('unit' in value)
    return col.num(value.unit.toString());

  else if ('fun' in value)
    return (value.fun.capturedNames.length === 0)
      ? `${unparse(Lam(value.fun), col, depth)}`
      : `${unparse(Lam(value.fun), col, depth)} where ${envRepr(value.closure, value.fun.capturedNames, col, depth+1)}`;

  else if ('native' in value)
    return col.constant(typeof value.name === 'string' ? value.name : value.name());

  else if ('symbol' in value)
    return col.constant(':' + value.symbol);

  else if ('bool' in value)
    return col.constant(`${value.bool}`);

  else
    return value.table.size === 0
      ? col.constant('{}')
      : (
        col.punctuation('{')
        + [...value.table.entries()].map(([k, v]) => `${col.name(k)}: ${prettyPrint(v, col, depth + 1)}`).join(', ')
        + col.punctuation('}')
      );
};


const ok = (v: Value): Partial<Value> => Ok(v);
const err = (e: RuntimeError): Partial<Value> => Err(e);

export const interpret = (expr: Expr, env: Env): Partial<Value> => {
  return matchExhaustive(expr, {
    Dec: value => ok(Unit(value)),
    Str: value => ok(Str(value)),
    Symbol: value => ok(Symbol(value)),
    Table: pairs => {
      const rv: [string, Value][] = [];
      for (const [k, subexpr] of pairs) {
        const subresult = interpret(subexpr, env);
        if ('err' in subresult)
          return subresult;
        rv.push([k, subresult.ok]);
      }
      return ok(Table(Map(rv)));
    },
    Name: name => {
      const result = tryLookupName(name, env);
      if (result === null)
        return err(UndefinedName(name));
      return ok(result);
    },
    App: ({fun, arg}) => Ei.flatMap(
      interpret(fun, env),
      f => Ei.flatMap(
        interpret(arg, env),
        a => applyFunction(f, a, env)
      )
    ),
    Lam: lam => ok(Fun(lam, env)),
    Cond: cond => ifThenElse(cond.if, cond.then, cond.else, env)
  });
};


const ifThenElse = (ifExpr: Expr, thenExpr: Expr, elseExpr: Expr, env: Env): Partial<Value> => {
  const condition = interpret(ifExpr, env);
  if ('err' in condition)
    return condition;
  if (!('bool' in condition.ok))
    return Err(UnexpectedType({expected: 'boolean', got: condition.ok}));

  return interpret(
    condition.ok.bool ? thenExpr : elseExpr,
    env
  );
};


export const bindNames = (declaration: LamArg, argument: Value, env: Env): Partial<[string, Value][]> => {
  if (declaration.tag === 'ArgSingle')
    return Ok([[declaration.value, argument]]);

  const rv: [string, Value][] = [];

  for (const [src, target] of declaration.value) {
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
};


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
      return Err(UnexpectedType({expected: 'symbol', got: arg}));
    const rv = fun.table.get(arg.symbol);
    if (rv === undefined)
      return Err(MissingKey(arg.symbol));
    return Ok(rv);
  }

  return Err(UnexpectedType({expected: 'table|function|native', got: fun}));
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
