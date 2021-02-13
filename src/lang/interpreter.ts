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
import { Parser } from "../parser";
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
  },
  namePriority: Prio(20, 'right'),
  defaultPriority: Prio(5, 'left'),
};


class StatefulParser {
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
  | { lexError: string; }
  | { parseError: string; }
  | { runtimeError: string; }
  ;

export class Interpreter {
  private env: Env;
  private stParser: StatefulParser;

  constructor() {
    this.env = makeEnv(this.envH);
    this.stParser = new StatefulParser();
  }

  public runLine(line: string): Either<LangError, Value> {
    let tokens: TokenStream<Tok>;
    try {
      tokens = lex(line);
    } catch (e) {
      return Err({ lexError: `${e}` });
    }

    const parsedE = this.stParser.parse(tokens);
    if ('err' in parsedE)
      return Err({ parseError: parsedE.err });
    const [expr, remainingTokens] = parsedE.ok;
    if (remainingTokens.length !== 0)
      return Err({ parseError: 'unexpected end of input' });

    try {
      return Ok(interpret(expr, this.env));
    } catch (e) {
      return Err({ runtimeError: `${e}` });
    }
  }

  ///

  private get envH(): EnvHandle {
    return {
      setName: (name, value) => { this.setName(name, value); },
      deleteName: name => { this.deleteName(name); }
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
};

const makeEnv = (h: EnvHandle): Env => {
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

  const ioFunctions = {
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
      s => Native(
        `(IO.define ${prettyPrint(s)})`,
        v => {
          h.setName(asStrOrSymb(s), v);
          return v;
        }
      )
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
    )
  };

  return {
    parent: null,
    names: Map({
      '+': Native('(+)', a => Native(`(${prettyPrint(a)} +)`, b => Num(asNum(a) + asNum(b)))),
      '-': Native('(-)', a => Native(`(${prettyPrint(a)} -)`, b => Num(asNum(a) - asNum(b)))),
      '*': Native('(*)', a => Native(`(${prettyPrint(a)} *)`, b => Num(asNum(a) * asNum(b)))),
      '^': Native('(^)', a => Native(`(${prettyPrint(a)} ^)`, b => Num(Math.pow(asNum(a), asNum(b))))),
      '++': Native('(++)', a => Native(() => `(${prettyPrint(a)} ++)`, b => Str(asStr(a) + asStr(b)))),
      '<<': Native('(<<)', a => Native(() => `(${prettyPrint(a)} <<)`, b => compose(a, b))),
      '>>': Native('(>>)', a => Native(() => `(${prettyPrint(a)} >>)`, b => compose(b, a))),
      '|>': Native('(|>)', a => Native(() => `(${prettyPrint(a)} |>)`, (f, env) => applyFunction(f, a, env))),
      'true': Bool(true),
      'false': Bool(false),

      'fallback': _fallback,
      '|?': _fallback,

      'IO': Table(Map(ioFunctions)),

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
