/**
 * This module is responsible for specifying the data structures
 * related to how a program is parsed and represented as an
 * Abstract Syntax Tree.
 */

import { Variant, impl, matchExhaustive } from '@practical-fp/union-types';
import Big from 'big.js';

export type Expr =
  | Variant<'Name',   string>
  | Variant<'App',    {fun: Expr, arg: Expr}>
  | Variant<'Dec',    Big>
  | Variant<'Str',    string>
  | Variant<'Symbol', string>
  | Variant<'Table',  [string, Expr][]>
  | Variant<'Cond',   {if: Expr, then: Expr, else: Expr}>
  | Variant<'Lam',    Lambda>;

export const { Name, App, Dec, Str, Symbol, Table, Cond, Lam } = impl<Expr>()

export type Lambda = {arg: LamArg, expr: Expr, capturedNames: string[]};

export const makeLambda = (arg: LamArg, expr: Expr): Expr =>
  Lam({
    arg,
    expr,
    capturedNames: getCapturedNames(expr, extractNamesFromArg(arg))
  });

// Types related to lambdas:

export type LamArg =
  | Variant<'ArgSingle', string>
  | Variant<'ArgTable', [string, LamArg][]>;

export const { ArgSingle, ArgTable } = impl<LamArg>();


// Types used by the parser:

export type Op =
  | Variant<'InfixOp', string>
  | Variant<'ExprOp', Expr>

export const { InfixOp, ExprOp } = impl<Op>();

export type Ops = {initial: Expr, chunks: [Op, Expr][]}

export type Priority = {strength: number, direction: 'left' | 'right'};
export const Prio = (
  strength: number,
  direction: 'left' | 'right'
): Priority =>
  ({strength, direction});

export type ParseOptions = {
  priorities: Record<string, Priority>,
  backtickPriority: Priority,  // priority for `f` and `g` in (a `f` b `g` c)
  defaultPriority: Priority
}


const extractNamesFromArg = (arg: LamArg): string[] =>
  matchExhaustive(arg, {
    ArgSingle: name => [name],
    ArgTable: table => table.flatMap(([_src, target]) => extractNamesFromArg(target))
  });


const _getCapturedNames = (expr: Expr, exclude: string[]): string[] =>
  matchExhaustive(expr, {
    Name: name => exclude.includes(name) ? [] : [name],
    App: ({fun, arg}) =>
      _getCapturedNames(fun, exclude)
      .concat(_getCapturedNames(arg, exclude)),
    Dec: () => [],
    Str: () => [],
    Symbol: () => [],
    Table: pairs => pairs.flatMap(([_, subexpr]) => _getCapturedNames(subexpr, exclude)),
    Lam: ({capturedNames}) => capturedNames.filter(name => !exclude.includes(name)),
    Cond: (e) => [
      ..._getCapturedNames(e.if, exclude),
      ..._getCapturedNames(e.then, exclude),
      ..._getCapturedNames(e.else, exclude)
    ]
  });


const unique =
  <T>(arr: ReadonlyArray<T>): T[] =>
  [...new Set(arr)];

const getCapturedNames =
  (expr: Expr, exclude: string[]): string[] =>
  unique(_getCapturedNames(expr, exclude));
