import { Expr, ParseOptions, Prio, Priority } from "./ast";
import { makeParser, unparse } from "./parser";
import {
  applyFunction,
  asFun,
  asNum as asInt,
  asStr,
  asStrOrSymb,
  asTable,
  Bool,
  Env,
  FunT,
  interpret,
  Native,
  NativeOk,
  Int,
  Partial,
  prettyPrint,
  renderRuntimeError,
  RuntimeError,
  Str,
  Symbol,
  Table,
  Value,
} from "./runtime";
import { Map } from "immutable";
import { lex, Tok } from "./lexer";
import { TokenParser, TokenStream } from "../language";

import { Either, Err, Ok } from "../either";
import * as Ei from '../either';



const DEFAULT_PARSER_OPTIONS = {
  priorities: {
    '+': Prio(6, 'left'),
    '-': Prio(6, 'left'),
    '*': Prio(8, 'left'),
    '^': Prio(10, 'right'),
    '++': Prio(10, 'left'),
    '<<': Prio(3, 'right'),
    '>>': Prio(3, 'left'),
    '|>': Prio(2, 'left'),
    '|?': Prio(3, 'right'),
    '$': Prio(1, 'left'),
  },
  backtickPriority: Prio(20, 'right'),
  defaultPriority: Prio(5, 'left'),
};


export class StatefulParser {
  private parser: TokenParser<Tok, Expr>;
  private setOptions: (o: ParseOptions) => void;
  private options: ParseOptions;

  constructor() {
    this.options = DEFAULT_PARSER_OPTIONS;
    [this.parser, this.setOptions] = makeParser(this.options);
  }

  public setPrio(name: string, prio: Priority) {
    this.options = {
      ...this.options,
      priorities: {
        ...this.options.priorities,
        [name]: prio,
      },
    };
    this.setOptions(this.options);
  }

  public parse(stream: TokenStream<Tok>) {
    return this.parser.parse(stream);
  }
}



export type LangError =
  | { type: 'lexError', msg: string }
  | { type: 'parseError', msg: string }
  | { type: 'runtimeError', err: RuntimeError }
  ;

export class Interpreter {
  private env: Env;
  private stParser: StatefulParser;
  private exit: () => void;

  constructor(
    exit: () => void,
    parentEnv: Env | null = null,
    parser: StatefulParser | null = null,
  ) {
    this.exit = exit;
    this.stParser = parser || new StatefulParser();
    this.env = makeEnv(this.envH, parentEnv);
  }

  public runAst(expr: Expr): Either<LangError, Value> {
    const rv = interpret(expr, this.env);
    if ('ok' in rv)
      return Ok(rv.ok);
    return Err({ type: 'runtimeError', err: rv.err });
  }

  public runLine(line: string): Either<LangError, Value> {
    let tokens: TokenStream<Tok>;
    try {
      tokens = lex(line);
    } catch (e) {
      return Err({ type: 'lexError', msg: `${e}` });
    }

    const parsedE = this.stParser.parse(tokens);
    if ('err' in parsedE)
      return Err({ type: 'parseError', msg: parsedE.err.msg });
    const [expr, remainingTokens] = parsedE.ok;
    if (remainingTokens.length !== 0)
      return Err({ type: 'parseError', msg: 'unexpected end of input' });

    return this.runAst(expr);
  }

  ///

  private get envH(): EnvHandle {
    return {
      setName: (name, value) => { this.setName(name, value); },
      deleteName: name => { this.deleteName(name); },
      exit: this.exit,
    };
  }

  private setName(name: string, value: Value) {
    this.env.names = this.env.names.set(name, value);
  }

  private deleteName(name: string) {
    this.env.names = this.env.names.delete(name);
  }
}


const compose = (f1: Value, f2: Value): Value =>
  Native(
    `(${prettyPrint(f2)} >> ${prettyPrint(f1)})`,
    (arg: Value, env: Env) =>
      Ei.flatMap(
        applyFunction(f2, arg, env),
        x2 => applyFunction(f1, x2, env)
      )
  );


/// Prelude


export type EnvHandle = {
  setName: (name: string, value: Value) => void,
  deleteName: (name: string) => void,
  exit: () => void,
};


const unit: Value = Table(Map({}));


const _makeModule = (
  name: string,
  table: Map<string, Value>
) => {
  const tableV = Table(table.set('__table__', Table(table)));
  return Native(name, (key, env) => applyFunction(tableV, key, env))
};


const _dumpEnv = (env: Env, depth: number = 0) => {
  [...env.names.entries()].sort().forEach(
    ([k, v]) => console.log('  '.repeat(depth) + `${k} : ${prettyPrint(v)}`)
  );
  if (env.parent !== null)
    _dumpEnv(env.parent, depth + 1);
};


const _binOp =
<A, B>(
  name: string,
  first: (a: Value) => Partial<A>,
  second: (b: Value) => Partial<B>,
  f: (a: A, b: B, env: Env) => Partial<Value>
): Value =>
  NativeOk(
    `(${name})`,
    a => Native(
      () =>`(${prettyPrint(a)} ${name})`,
      (b, env) =>
        Ei.flatMap(
          first(a),
          parsedA => Ei.flatMap(
            second(b),
            parsedB => f(parsedA, parsedB, env)
          )
        )
    )
  );


const _binOpId = (
  name: string,
  f: (a: Value, b: Value, env: Env) => Partial<Value>
): Value =>
  _binOp(name, Ok, Ok, f);


const ModuleIO = (h: EnvHandle) =>_makeModule('IO', Map({
  'log': NativeOk(
    'IO:log',
    s => {
      console.log(asStr(s));
      return unit;
    }
  ),

  'debug': NativeOk(
    'IO:debug',
    a => {
      console.log(prettyPrint(a));
      return a;
    }),

  'define': Native(
    'IO:define',
    s =>
      Ei.map(
        asStrOrSymb(s),
        varName => {
          h.deleteName(varName);
          return NativeOk(
            `(IO:define ${prettyPrint(s)})`,
            varValue => { h.setName(varName, varValue); return varValue; }
          );
        }
      )
  ),

  'forget': Native(
    'IO:forget',
    s => Ei.map(asStrOrSymb(s), varName => { h.deleteName(varName); return unit; })
  ),

  'try': NativeOk(
    'IO:try',
    (fn, env) => Ei.dispatch(
      applyFunction(fn, unit, env),
      ok => Table(Map({ok})),
      renderRuntimeError
    )
  ),

  'locals': NativeOk(
    'IO:locals',
    (_, env) => {
      _dumpEnv(env);
      return unit;
    }
  ),

  'exit': NativeOk(
    'IO:exit',
    () => {
      h.exit();
      return unit;
    }
  ),
}));


const ModuleInt = _makeModule("Int", Map({
  '=': _binOp('=', asInt, asInt, (a, b) => Ok(Bool(a === b))),
  '!=': _binOp('!=', asInt, asInt, (a, b) => Ok(Bool(a !== b))),
  '<': _binOp('<', asInt, asInt, (a, b) => Ok(Bool(a < b))),
  '>': _binOp('>', asInt, asInt, (a, b) => Ok(Bool(a > b))),
  '>=': _binOp('>=', asInt, asInt, (a, b) => Ok(Bool(a >= b))),
  '<=': _binOp('<=', asInt, asInt, (a, b) => Ok(Bool(a <= b))),
}));


const ModuleStr = _makeModule("Str", Map({
  '=': _binOp('=', asStr, asStr, (a, b) => Ok(Bool(a === b))),
  '!=': _binOp('!=', asStr, asStr, (a, b) => Ok(Bool(a !== b))),
  'lower?': Native('lower?', value => Ei.map(asStr(value), s => Bool(s.toLowerCase() === s))),
  'upper?': Native('upper?', value => Ei.map(asStr(value), s => Bool(s.toUpperCase() === s))),
}));


const makeEnv = (h: EnvHandle, parent: Env | null = null): Env => {

  const _fallback = _binOpId('|?', (primaryV, fallbackV) =>
    Ok(Native(
      () => `(${prettyPrint(primaryV)} |? ${prettyPrint(fallbackV)})`,
      (key, env) => {
        const primaryResult = applyFunction(primaryV, key, env);
        if ('ok' in primaryResult)
          return primaryResult;

        const {err} = primaryResult;
        if (err.type !== 'missingKey')
          return Err(err);
        return applyFunction(fallbackV, key, env);
      }
    ))
  );

  return {
    parent,
    names: Map({
      '+': _binOp('+', asInt, asInt, (a, b) => Ok(Int(a + b))),
      '-': _binOp('-', asInt, asInt, (a, b) => Ok(Int(a - b))),
      '*': _binOp('*', asInt, asInt, (a, b) => Ok(Int(a * b))),
      '^': _binOp('^', asInt, asInt, (a, b) => Ok(Int(a ** b))),
      '++': _binOp('-', asStr, asStr, (a, b) => Ok(Str(a + b))),
      '<<': _binOpId('<<', (a, b) => Ok(compose(a, b))),
      '>>': _binOpId('>>', (a, b) => Ok(compose(b, a))),
      '|>': _binOpId('|>', (a, f, env) => applyFunction(f, a, env)),
      '$': _binOpId('$', (f, a, env) => applyFunction(f, a, env)),

      'true': Bool(true),
      'false': Bool(false),

      'fallback': _fallback,
      '|?': _fallback,

      'Num': ModuleInt,
      'Str': ModuleStr,
      'IO': ModuleIO(h),
    })
  };
};
