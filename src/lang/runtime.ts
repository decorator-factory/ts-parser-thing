import {  Expr, Lam, LamArg, Lambda } from './ast';
import { unparse } from './parser';

import { Ok, Err, Either } from '../either';
import * as Ei from '../either';

import { Map } from 'immutable';
import { ColorHandle, identityColorHandle } from './color';
import { Dimension, makeUnit, Unit as UnitType, UnitSource } from './units';
import { impl, matchExhaustive, matchWildcard, predicate, Variant, WILDCARD } from '@practical-fp/union-types';


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
  | Variant<'Str', string>
  | Variant<'Unit', UnitType>
  | Variant<'Symbol', string>
  | Variant<'Fun', {fun: Lambda, closure: Env}>
  | Variant<'Native', {fun: NativeFn, name: LazyName}>
  | Variant<'Table', Map<string, Value>>
  | Variant<'Bool', boolean>;


const vimpl = impl<Value>();
export const {
  Str,
  Symbol,
  Fun,
  Native,
  Table,
  Bool
} = vimpl

export const Unit = (...src: UnitSource): Value => vimpl.Unit(makeUnit(...src));
Unit.is = predicate('Unit');


export const NativeOk = (name: LazyName, fun: (v: Value, e: Env) => Value): Value =>
  Native({name, fun: (v, e) => Ok(fun(v, e))})


export type RuntimeError =
  | Variant<'UnexpectedType', {expected: string, got: Value}>
  | Variant<'MissingKey', string>
  | Variant<'UndefinedName', string>
  | Variant<'DimensionMismatch', {left: Dimension, right: Dimension}>
  | Variant<'NotInDomain', {value: Value, explanation: string}>
  | Variant<'Other', Value>


export const {
  UnexpectedType,
  MissingKey,
  UndefinedName,
  DimensionMismatch,
  NotInDomain,
  Other,
} = impl<RuntimeError>();


export const renderRuntimeError = (error: RuntimeError): Value => {
  const details: Record<string, Value> =
    matchExhaustive(error, {
      UnexpectedType: ({expected, got}) => ({expected: Str(expected), got}),
      MissingKey: key => ({key: Str(key)}),
      UndefinedName: name => ({name: Str(name)}),
      DimensionMismatch: ({left, right}) => ({left: Unit(1, left), right: Unit(1, right)}),
      NotInDomain: ({value, explanation}) => ({value, explanation: Str(explanation)}),
      Other: value => ({value}),
    });
  return Table(Map({
    error: Str(error.tag),
    details: Table(Map(details))
  }));
};


export type Partial<A> = Either<RuntimeError, A>;


export const asUnit = (v: Value): Partial<UnitType> => {
  if (!Unit.is(v))
    return Err(UnexpectedType({expected: 'unit', got: v}));
  return Ok(v.value);
};

export const asStr = (v: Value): Partial<string> => {
  if (!Str.is(v))
    return Err(UnexpectedType({expected: 'string', got: v}));
  return Ok(v.value);
};

export const asSymb = (v: Value): Partial<string> => {
  if (!Symbol.is(v))
    return Err(UnexpectedType({expected: 'symbol', got: v}));
  return Ok(v.value);
};

export const asStrOrSymb = (v: Value): Partial<string> => {
  if (Str.is(v) || Symbol.is(v))
    return Ok(v.value);
  return Err(UnexpectedType({expected: 'string|symbol', got: v}));
};

export const asTable = (v: Value): Partial<Map<string, Value>> => {
  if (!Table.is(v))
    return Err(UnexpectedType({expected: 'table', got: v}));
  return Ok(v.value);
};

export const asFun = (v: Value): Partial<FunT> => {
  if (!Fun.is(v))
    return Err(UnexpectedType({expected: 'function', got: v}));
  return Ok(v.value);
};

export const asAny = (v: Value): Partial<Value> => {
  return Ok(v);
};

export const asBool = (v: Value): Partial<boolean> => {
  if (!Bool.is(v))
    return Err(UnexpectedType({expected: 'boolean', got: v}));
  return Ok(v.value)
};



export interface PrettyPrintOptions {
  includeWhere: false
}


const defaultOpts: PrettyPrintOptions = {
  includeWhere: false,
};



export const envRepr = (
  env: Env,
  keys: string[],
  col: ColorHandle = identityColorHandle,
  opts: PrettyPrintOptions = defaultOpts,
  depth: number = 0
): string => {
  if (depth > 3)
    return col.punctuation('{') + '...' + col.punctuation('}');

  const lines: string[] = [];
  for (const key of keys){
    const v = tryLookupName(key, env);
    const vs = v === null ? '?' : prettyPrint(v, col, opts, depth+1);
    lines.push(`${key}: ${vs}`);
  }
  return col.punctuation('{') + lines.join(', ') + col.punctuation('}');
}


export const prettyPrint = (
  value: Value,
  col: ColorHandle = identityColorHandle,
  opts: PrettyPrintOptions = defaultOpts,
  depth: number = 0
): string => {
  if (depth > 12)
    return '...';

  return matchExhaustive(value, {
    Str: s => col.str(JSON.stringify(s)),
    Unit: u => col.num(u.toString()),
    Fun: ({fun, closure}) =>
      (fun.capturedNames.length === 0) || !opts.includeWhere
      ? `${unparse(Lam(fun), col, depth)}`
      : `${unparse(Lam(fun), col, depth)} where ${envRepr(closure, fun.capturedNames, col, opts, depth+1)}`,
    Native: ({name}) =>
      col.constant(typeof name === 'string' ? name : name()),
    Symbol: s => col.constant(':' + s),
    Bool: b => col.constant(`${b}`),
    Table: table => (
        col.punctuation('{')
        + [...table.entries()].map(([k, v]) => `${col.name(k)}: ${prettyPrint(v, col, opts, depth + 1)}`).join(', ')
        + col.punctuation('}')
      ),
  })
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
    Lam: lam => ok(Fun({fun: lam, closure: env})),
    Cond: cond => ifThenElse(cond.if, cond.then, cond.else, env)
  });
};


const ifThenElse = (ifExpr: Expr, thenExpr: Expr, elseExpr: Expr, env: Env): Partial<Value> => {
  const condition = interpret(ifExpr, env);
  if ('err' in condition)
    return condition;

  if (condition.ok.tag !== 'Bool')
    return Err(UnexpectedType({expected: 'boolean', got: condition.ok}));

  return interpret(
    condition.ok.value ? thenExpr : elseExpr,
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


export const applyFunction = (callable: Value, arg: Value, env: Env): Partial<Value> =>
  matchWildcard(callable, {
    Native: ({fun}) => fun(arg, env),

    Fun: ({fun, closure}) => Ei.flatMap(
      bindNames(fun.arg, arg, env),
      boundNames =>
        interpret(
          fun.expr,
          { parent: closure, names: Map(boundNames) }
        )
    ),

    Table: table => {
      if (arg.tag !== 'Symbol')
        return err(UnexpectedType({expected: 'symbol', got: arg}));
      const rv = table.get(arg.value);
      if (rv === undefined)
        return err(MissingKey(arg.value));
      return ok(rv)
    },

    [WILDCARD]: () => err(UnexpectedType({expected: 'table|function|native', got: callable}))
  });
