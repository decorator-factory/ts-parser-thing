import { Expr, LamT } from './ast';
import { makeParser, unparse } from './parser';


const lookupName = (name: string, env: Env): Value => {
  if (name in env.names)
    return env.names[name];
  if (env.parent === null)
    throw new Error(`Name ${name} not found`);
  return lookupName(name, env.parent);
};


export type Env = {
  parent: Env | null;
  names: Record<string, Value>;
}


export type NativeFn = (v: Value, e: Env) => Value;


export type Value =
  | {str: string}
  | {num: number}
  | {fun: LamT, closure: Env}
  | {native: NativeFn, name: string}


const Str = (str: string): Value => ({str});
const Num = (num: number): Value => ({num});
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


const envRepr = (env: Env, keys: string[]): string => {
  const lines: string[] = [];
  for (const key of keys)
    lines.push(`${key}: ${prettyPrint(lookupName(key, env))}`);
  return '{' + lines.join(', ') + '}';
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
  else
    throw new Error(`${v} somehow got into prettyPrint`)
};


export const interpret = (expr: Expr, env: Env): Value => {
  switch (expr.tag) {
    case 'num':
      return Num(expr.value);

    case 'str':
      return Str(expr.value);

    case 'name':
      return lookupName(expr.name, env);

    case 'app':
      return applyFunction(interpret(expr.fun, env), interpret(expr.arg, env), env);

    case 'lam':
      return Fun(expr, env);
  }
};


const compose = (f1: Value, f2: Value): Value =>
  Native(
    `(${prettyPrint(f1)} . ${prettyPrint(f2)})`,
    (arg: Value, env: Env) => applyFunction(f1, applyFunction(f2, arg, env), env)
  );


const GLOBAL_ENV: Env = {
  parent: null,
  names: {
    '+': Native('(+)', a => Native(`(${prettyPrint(a)} +)`, b => Num(asNum(a) + asNum(b)))),
    '-': Native('(-)', a => Native(`(${prettyPrint(a)} -)`, b => Num(asNum(a) - asNum(b)))),
    '*': Native('(*)', a => Native(`(${prettyPrint(a)} *)`, b => Num(asNum(a) * asNum(b)))),
    '^': Native('(^)', a => Native(`(${prettyPrint(a)} ^)`, b => Num(Math.pow(asNum(a), asNum(b))))),
    '++': Native('(++)', a => Native(`(${prettyPrint(a)} ++)`, b => Str(asStr(a) + asStr(b)))),
    '.': Native('(.)', a => Native(`(${prettyPrint(a)} . )`, b => compose(a, b))),
  }
};


export const PARSER = makeParser({
  priorities: {
    '+': 6,
    '-': 6,
    '*': 8,
    '^': 10,
    '++': 10,
  },
  namePriority: 20,
  defaultPriority: 5
});


export const run = (expr: Expr): Value => interpret(expr, GLOBAL_ENV);


const applyFunction = (fun: Value, arg: Value, env: Env): Value => {
  if ('native' in fun)
    return fun.native(arg, env);

  if (!('fun' in fun))
    throw new Error(`Trying to apply ${prettyPrint(fun)}, which isn't a function`);

  return interpret(
    fun.fun.expr,
    {
      parent: fun.closure,
      names: { [fun.fun.argName]: arg }
    }
  );
};
