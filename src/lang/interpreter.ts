import { Expr, ParseOptions, Prio, Priority } from "./ast";
import { makeParser } from "./parser";
import {
  applyFunction,
  asFun,
  asNum,
  asStr,
  asStrOrSymb,
  asTable,
  Bool,
  Env,
  FunT,
  interpret,
  Native,
  Num,
  prettyPrint,
  Str,
  Table,
  Value,
} from "./runtime";
import { Map } from "immutable";
import { lex, Tok } from "./lexer";
import { TokenParser, TokenStream } from "../language";
import { Either, Err, Ok } from "../either";


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
  | { type: 'runtimeError', msg: string }
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
    try {
      return Ok(interpret(expr, this.env));
    } catch (e) {
      return Err({ type: 'runtimeError', msg: `${e}` });
    }
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
      return Err({ type: 'parseError', msg: parsedE.err });
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
    (arg: Value, env: Env) => applyFunction(f1, applyFunction(f2, arg, env), env)
  );


type EnvHandle = {
  setName: (name: string, value: Value) => void,
  deleteName: (name: string) => void,
  exit: () => void,
};

const makeEnv = (h: EnvHandle, parent: Env | null = null): Env => {
  const _dumpEnv = (env: Env, depth: number = 0) => {
    [...env.names.entries()].sort().forEach(
      ([k, v]) => console.log('  '.repeat(depth) + `${k} : ${prettyPrint(v)}`)
    );
    if (env.parent !== null)
      _dumpEnv(env.parent, depth + 1);
  };

  const unit: Value = Table(Map({}));

  const _fallback = Native(
    '(|?)',
    tableV => Native(
      () => `(${prettyPrint(tableV)} |?)`,
      (fallbackV) => Native(
        () => `(${prettyPrint(tableV)} |? ${prettyPrint(fallbackV)})`,
        (key, env) => {
          if (!('table' in tableV))
            return applyFunction(tableV, key, env);
          const table = asTable(tableV);
          if (!('symbol' in key))
            return applyFunction(fallbackV, key, env);
          const rv = table.get(key.symbol);
          if (rv === undefined)
            return applyFunction(fallbackV, key, env);
          return rv;
        }
      )
    ));

  const ioFunctions = Map({
    'log': Native(
      'IO.log',
      s => {
        console.log(asStr(s));
        return unit;
      }
    ),

    'debug': Native(
      'IO.debug',
      a => {
        console.log(prettyPrint(a));
        return a;
      }),

    'define': Native(
      'IO.define',
      s => {
        h.deleteName(asStrOrSymb(s));
        return Native(
          `(IO.define ${prettyPrint(s)})`,
          v => {
            h.setName(asStrOrSymb(s), v);
            return v;
          }
        );
      }
    ),

    'forget': Native(
      'IO.forget',
      s => {
        h.deleteName(asStrOrSymb(s));
        return unit;
      }
    ),

    'try': Native(
      'IO.try',
      (fn, env) => {
        try {
          return Table(Map({
            ok: applyFunction(fn, unit, env)
          }));
        } catch (e) {
          return Table(Map({
            error: Str(`${e}`)
          }));
        }
      }
    ),

    'locals': Native(
      'IO.locals',
      (_, env) => {
        _dumpEnv(env);
        return unit;
      }
    ),

    'exit': Native(
      'IO.exit',
      () => {
        h.exit();
        return unit;
      }
    ),
  });

  const _binOp =
    <A, B>(
      name: string,
      first: (a: Value) => A,
      second: (b: Value) => B,
      f: (a: A, b: B, env: Env) => Value
    ): Value =>
      Native(
        `(${name})`,
        a => Native(
          () =>`(${prettyPrint(a)} ${name})`,
          (b, env) => f(first(a), second(b), env)
        )
      );

  const _binOpId = (
      name: string,
      f: (a: Value, b: Value, env: Env) => Value
    ): Value =>
      _binOp(name, a=>a, b=>b, f);

  const _makeModule = (
      name: string,
      table: Map<string, Value>
    ) => {
      const tableV = Table(table.set('__table__', Table(table)));
      return Native(name, (key, env) => applyFunction(tableV, key, env))
    };

  const numFunctions = Map({
    '=': _binOp('=', asNum, asNum, (a, b) => Bool(a === b)),
  });

  const strFunctions = Map({
    '=': _binOp('=', asStr, asStr, (a, b) => Bool(a === b)),
  });

  return {
    parent,
    names: Map({
      '+': _binOp('+', asNum, asNum, (a, b) => Num(a + b)),
      '-': _binOp('-', asNum, asNum, (a, b) => Num(a - b)),
      '*': _binOp('*', asNum, asNum, (a, b) => Num(a * b)),
      '^': _binOp('^', asNum, asNum, (a, b) => Num(Math.pow(a, b))),
      '++': _binOp('-', asStr, asStr, (a, b) => Str(a + b)),
      '<<': _binOpId('<<', compose),
      '>>': _binOpId('>>', (a, b) => compose(b, a)),
      '|>': _binOpId('|>', (a, f, env) => applyFunction(f, a, env)),
      '$': _binOpId('$', (f, a, env) => applyFunction(f, a, env)),

      'true': Bool(true),
      'false': Bool(false),

      'fallback': _fallback,
      '|?': _fallback,

      'Num': _makeModule('Num', numFunctions),
      'Str': _makeModule('Str', strFunctions),
      'IO': _makeModule('IO', ioFunctions),

      'given': Native(
        'given',
        namesV => Native(
          () => `(given ${prettyPrint(namesV)})`,
          (funV, env) => {
            const table = asTable(namesV);
            const fun = asFun(funV);

            const newClosure: Env = {
              parent: fun.closure,
              names: table
            };

            const newFun: FunT = {
              fun: fun.fun,
              closure: newClosure
            };
            return applyFunction(newFun, unit, env);
          }
        )
      )
    })
  };
};
