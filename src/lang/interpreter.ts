import { Expr, ParseOptions, Prio, Priority } from './ast';
import * as ast from './ast';
import { makeParser } from './parser';
import {
  applyFunction,
  asStr,
  asStrOrSymb,
  Bool,
  Env,
  interpret,
  Native,
  NativeOk,
  Partial,
  prettyPrint,
  renderRuntimeError,
  RuntimeError,
  Str,
  Symbol,
  Table,
  Value,
  Unit,
  asUnit,
  DimensionMismatch,
  NotInDomain,
  Other,
  asSymb,
  asAny,
  asFun,
  asTable,
  UnexpectedType,
  Fun,
  asBool,
} from './runtime';
import { Map } from 'immutable';
import { lex, Tok } from './lexer';
import { TokenParser, TokenStream } from '../language';

import { Either, Err, Ok } from '../either';
import * as Ei from '../either';
import { dimEq, neutralDimension } from './units';
import Fraction from 'fraction.js';
import Big from 'big.js';

import * as fs from 'fs';
import * as util from 'util';
import { matchWildcard, WILDCARD } from '@practical-fp/union-types';



const DEFAULT_PARSER_OPTIONS = {
  priorities: {
    '.=': Prio(0, 'left'),

    '+': Prio(6, 'left'),
    '-': Prio(6, 'left'),
    '*': Prio(8, 'left'),
    '/': Prio(8, 'left'),
    '^': Prio(9, 'left'),
    '^/': Prio(9, 'left'),

    '++': Prio(10, 'left'),
    '<<': Prio(3, 'right'),
    '>>': Prio(3, 'left'),
    '|>': Prio(2, 'left'),
    '|?': Prio(3, 'right'),
    '$': Prio(1, 'right'),
    '$|': Prio(-1, 'left'),
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

  public parseMultiline(stream: TokenStream<Tok>): Either<LangError, Expr[]> {
    const expressions: Expr[] = [];
    let expr;
    while (stream.length !== 0) {
      const parsedE = this.parse(stream);
      if ('err' in parsedE)
        return Err({ type: 'parseError', msg: parsedE.err.msg });
      [expr, stream] = parsedE.ok;
      expressions.push(expr);
    }
    return Ok(expressions);
  }
}



export type LangError =
  | { type: 'lexError', msg: string }
  | { type: 'parseError', msg: string }
  | { type: 'runtimeError', err: RuntimeError }
  ;


export interface IOHandle {
  readLine: () => string;
  writeLine: (s: string) => void;
  exit: () => void;
  resolveModule: (location: string, moduleName: string) => Either<LangError, Value> | null;
}


export class Interpreter {
  public env: Env;
  private location: string;
  private stParser: StatefulParser;
  private ioHandle: IOHandle;

  constructor(
    ioHandle: IOHandle,
    parentEnv: Env | null = null,
    parser: StatefulParser | null = null,
    location: string | null = null,
  ) {
    this.ioHandle = ioHandle;
    this.stParser = parser || new StatefulParser();
    this.location = location || process.cwd();
    this.env = makeEnv(this.envH, parentEnv);
  }

  public runAst(expr: Expr): Either<LangError, Value> {
    const rv = interpret(expr, this.env);
    if ('ok' in rv)
      return Ok(rv.ok);
    return Err({ type: 'runtimeError', err: rv.err });
  }

  public runLine(line: string): Either<LangError, Value> {
    const tokens = lex(line);
    if (typeof tokens === 'string')
      return Err({ type: 'lexError', msg: tokens });

    const parsedE = this.stParser.parse(tokens);
    if ('err' in parsedE)
      return Err({ type: 'parseError', msg: parsedE.err.msg });
    const [expr, remainingTokens] = parsedE.ok;
    if (remainingTokens.length !== 0) {
      const parsedTokens = tokens.slice(0, -remainingTokens.length);
      const parsedPart = parsedTokens.map(t => t.content).join(' ');
      const extraPart = remainingTokens.map(t => t.content).join(' ');
      return Err({
        type: 'parseError',
        msg: `I have parsed ${parsedPart} but there's still a leftover: ${extraPart}.\n`
             + `Perhaps you forgot an opening (, [ or {, or to write a function body?`
      });
    }

    return this.runAst(expr);
  }

  public runMultiline(source: string): Either<LangError, Value[]> {
    const ok: Value[] = [];
    let err: LangError | null = null;

    this.runMultilineWithCallback(
      source,
      value => ok.push(value),
      e => err = e,
    );

    if (err !== null)
      return {err};

    return {ok};

  }

  public runMultilineIgnore(source: string): LangError | null {
    let err = null as LangError | null;

    this.runMultilineWithCallback(
      source,
      () => {},
      e => err = e,
    );

    return err;
  }

  public runMultilineReturnLast(source: string): Either<LangError, Value> {
    let ok = null as Value | null;
    let err = null as LangError | null;

    this.runMultilineWithCallback(
      source,
      v => ok = v,
      e => err = e,
    );

    if (err !== null)
      return {err};

    if (ok === null)
      return {err: {type: 'runtimeError', err: Other(Str('runMultilineReturnLast: no value got produced'))}};

    return {ok};
  }

  public runMultilineWithCallback(source: string, onValue: (v: Value) => void, onError: (e: LangError) => void): void {
    source = source.trim();

    const stream = lex(source);
    if (typeof stream === 'string') {
      onError({ type: 'lexError', msg: stream })
      return;
    }

    const parsed = this.stParser.parseMultiline(stream);

    if ('err' in parsed) {
      onError(parsed.err);
      return;
    }

    const expressions = parsed.ok

    for (const expr of expressions) {
      const maybeValue = this.runAst(expr);
      if ('err' in maybeValue) {
        onError(maybeValue.err);
        return;
      }
      onValue(maybeValue.ok);
    }
  }

  private get envH(): EnvHandle {
    return {
      parser: this.stParser,
      setName: (name, value) => { this.setName(name, value); },
      deleteName: name => { this.deleteName(name); },
      io: this.ioHandle,
      location: this.location,
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
  Native({
    name: `(${prettyPrint(f2)} >> ${prettyPrint(f1)})`,
    fun: (arg: Value, env: Env) =>
      Ei.flatMap(
        applyFunction(f2, arg, env),
        x2 => applyFunction(f1, x2, env)
      )
  });


/// Prelude


export type EnvHandle = {
  parser: StatefulParser,
  setName: (name: string, value: Value) => void,
  deleteName: (name: string) => void,
  io: IOHandle,
  location: string,
};


const unit: Value = Table(Map({}));


const _makeModule = (
  name: string,
  table: Map<string, Value>
) => {
  const tableV = Table(table.set('__table__', Table(table)));
  return Native({name, fun: (key, env) => applyFunction(tableV, key, env)})
};


const _dumpEnv = function* (env: Env, depth: number = 0) {
  for (const [k, v] of [...env.names.entries()].sort())
    yield '  '.repeat(depth) + `${k} : ${prettyPrint(v)}`;
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
    a => Native({
      name: () =>`(${prettyPrint(a)} ${name})`,
      fun: (b, env) =>
        Ei.flatMap(
          first(a),
          parsedA => Ei.flatMap(
            second(b),
            parsedB => f(parsedA, parsedB, env)
          )
        )
    })
  );


const _binOpId = (
  name: string,
  f: (a: Value, b: Value, env: Env) => Partial<Value>
): Value =>
  _binOp(name, Ok, Ok, f);



const ModuleIO = (h: EnvHandle) =>_makeModule('IO', Map({
  'require': Native({
    name: 'IO:require',
    fun: nameV => Ei.flatMap(asStr(nameV), name => {
      const module = h.io.resolveModule(h.location, name);
      if (module === null)
        return Err(Other(Str(`module not found: ${name}`)));

      if ('err' in module) {
        if (module.err.type === 'runtimeError')
          return Err(module.err.err)
        else
          return Err(Other(Str(`${module.err.type}: ${module.err.msg}`)))
      }

      return module;
    }),
  }),

  'unpack': Native({
    name: 'IO:unpack',
    fun: (tableV) => Ei.flatMap(asTable(tableV), table => {
      table.forEach((value, name) => h.setName(name, value));
      return Ok(unit);
    })
  }),

  'location': Str(h.location),

  'log': Native({
    name: 'IO:log',
    fun: sV => Ei.flatMap(asStr(sV), s => {
      h.io.writeLine(s);
      return Ok(unit);
    })
  }),

  'readLine': Native({
    name: 'IO:readLine',
    fun: () => Ok(Str(h.io.readLine()))
  }),

  'debug': NativeOk(
    'IO:debug',
     a => {
      h.io.writeLine(prettyPrint(a));
      return a;
    }),

  'define': Native({
    name: 'IO:define',
    fun: s =>
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
  }),

  'forget': Native({
    name: 'IO:forget',
    fun: s => Ei.map(asStrOrSymb(s), varName => { h.deleteName(varName); return unit; })
  }),

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
      for (const line of _dumpEnv(env))
        h.io.writeLine(line);
      return unit;
    }
  ),

  'exit': NativeOk(
    'IO:exit',
    () => {
      h.io.exit();
      return unit;
    }
  ),
}));


const ModuleStr = _makeModule('Str', Map({
  '=': _binOp('=', asStr, asStr, (a, b) => Ok(Bool(a === b))),
  '!=': _binOp('!=', asStr, asStr, (a, b) => Ok(Bool(a !== b))),
  'lower?': Native({
    name: 'lower?',
    fun: value => Ei.map(asStr(value), s => Bool(s.toLowerCase() === s))
  }),
  'upper?': Native({
    name: 'upper?',
    fun: value => Ei.map(asStr(value), s => Bool(s.toUpperCase() === s))
  }),
  'from': NativeOk(
    'from',
    value => Str(prettyPrint(value))
  ),
}));



const _envToValue = (env: Env | null, includeGlobals: boolean): Value => {
  if (env === null)
    return Symbol('nil');

  if (env.parent === null && !includeGlobals)
    return Symbol('nil');

  return Table(Map({
    parent: _envToValue(env.parent, includeGlobals),
    names: Table(env.names),
  }));
};

const ModuleRefl = (h: EnvHandle) => _makeModule('Refl', Map({
  'lex': Native({
    name: 'lex',
    fun: (v, e) =>
      Ei.map(asStr(v), source => {
        const stream  = lex(source);
        if (typeof stream === 'string') {
          h.io.writeLine('Error: ' + stream);
        } else {
          for (const tok of stream)
            h.io.writeLine(`${tok.type} @${tok.position}: ${tok.content}`);
        }
        return unit;
      })
  }),
  'parse': Native({
    name: 'parse',
    fun: (v, e) =>
      Ei.map(asStr(v), source => {
        const stream  = lex(source);
        if (typeof stream === 'string') {
          h.io.writeLine('Error: ' + stream);
        } else {
          const parsed = h.parser.parseMultiline(stream);
          h.io.writeLine(util.inspect(parsed, {depth: null}));
        }
        return unit;
      })
  }),
  'get_closure': Native({
    name: 'get_closure',
    fun: (v, e) =>
      Ei.map(asFun(v), fun => _envToValue(fun.closure, false))
  }),
  'get_total_closure': Native({
    name: 'get_closure',
    fun: (v, e) =>
      Ei.map(asFun(v), fun => _envToValue(fun.closure, true))
  }),
}));


const ModuleSym = _makeModule('Sym', Map({
  'is': Native({
    name: 'Sym:is',
    fun: symV => Ei.map( asSymb(symV), sym => NativeOk(
      () => `Sym:is :${sym}`,
      v => {
        if (!Symbol.is(v))
          return Bool(false);

        return Bool(v.value === sym);
      }
    ))
  })
}));


const _chain = NativeOk('Imp:chain', () => _chain);

const ModuleImp = _makeModule('Imp', Map({
  'when': _binOp('Imp:when', asBool, asAny, (condition, fn, env) =>
    condition
      ? applyFunction(fn, unit, env)
      : Ok(unit)
  ),

  'chain': _chain,

  'early_return': Native({
    name: 'Imp:early_return',
    fun: (funV, env) => {
      let result: Value | null = null;
      const sentinel = new Error('`return` outside of Imp:early_return');
      const returnFn = NativeOk('return', value => {
        result = value;
        throw sentinel;
      })

      try {
        const x = applyFunction(funV, returnFn, env);
        return x;
      } catch (e) {
        if (e === sentinel) {
          return Ok(result!);
        } else
          throw e;
      }
    }
  }),

  'while': NativeOk(
    'Imp:while',
    (condition, condEnv) => Native({
      name: () => `Imp:while ${prettyPrint(condition)}`,
      fun: (body, bodyEnv) => {
        let result: Value = unit;

        const breakSentinel = new Error('`break` outside of a loop');
        const breakFn = NativeOk('break', () => { throw breakSentinel; });

        const continueSentinel = new Error('`continue` outside of a loop');
        const continueFn = NativeOk('continue', () => { throw continueSentinel; });

        const bodyArg = Table(Map({ break: breakFn, continue: continueFn, }));

        while (true) {
          const cond = applyFunction(condition, unit, condEnv);
          if ('err' in cond)
            return cond;

          if (!Bool.is(cond.ok))
            return { err: UnexpectedType({ expected: 'boolean', got: cond.ok }) };

          if (!cond.ok.value)
            break;

          let step: Partial<Value>;
          try {
            step = applyFunction(body, bodyArg, bodyEnv);
          } catch (e) {
            if (e === breakSentinel)
              break;
            else if (e === continueSentinel)
              continue;
            else
              throw e;
          }
          if ('err' in step)
            return step;

          result = step.ok;
        }
        return { ok: result };
      },
    }))
}));



const asNeutral = (v: Value): Partial<Big> =>
  Ei.flatMap(asUnit(v), a =>
    dimEq(a.dim, neutralDimension)
      ? Ok(a.value)
      : Err(DimensionMismatch({left: a.dim, right: neutralDimension})));


const makeEnv = (h: EnvHandle, parent: Env | null = null): Env => {

  const _fallback = _binOpId('|?', (primaryV, fallbackV) =>
    Ok(Native({
      name: () => `(${prettyPrint(primaryV)} |? ${prettyPrint(fallbackV)})`,
      fun: (key, env) => {
        const primaryResult = applyFunction(primaryV, key, env);
        if ('ok' in primaryResult)
          return primaryResult;

        const {err} = primaryResult;
        if (err.tag !== 'MissingKey')
          return Err(err);
        return applyFunction(fallbackV, key, env);
      }
    }))
  );

  const _weakEquality = (a: Value, b: Value): boolean => {
    if (a.tag > b.tag)
      return _weakEquality(b, a);

    return matchWildcard(a, {
      Str: v => b.tag === 'Str' && b.value === v,

      Unit: u => b.tag === 'Unit' && u.equals(b.value),

      Symbol: s => b.tag === 'Symbol' && b.value === s,

      Bool: x => b.tag === 'Bool'  && b.value === x,

      Table: aTable => {
        if (b.tag !== 'Table')
          return false;

        const bTable = b.value;

        if ([...aTable.keys()].sort() !== [...bTable.keys()].sort())
          return false;

        for (const [k, v] of aTable.entries())
          if (!_weakEquality(v, bTable.get(k)!))
            return false;
        return true;
      },

      [WILDCARD]: () => false,
    });
  }

  return {
    parent,
    names: Map({
      '+': _binOp('+', asUnit, asUnit, (a, b) => {
        const rv = a.add(b);
        if (!rv)
          return Err(DimensionMismatch({left: a.dim, right: b.dim}));
        return Ok(Unit(rv));
      }),
      '-': _binOp('-', asUnit, asUnit, (a, b) => {
        const rv = a.sub(b);
        if (!rv)
          return Err(DimensionMismatch({left: a.dim, right: b.dim}));
        return Ok(Unit(rv));
      }),
      '*': _binOp('*', asUnit, asUnit, (a, b) => Ok(Unit(a.mul(b)))),
      '/': _binOp('/', asUnit, asUnit, (a, b) => {
        const rv = a.div(b);
        if (!rv)
          return Err(NotInDomain({value: Table(Map({x: Unit(a), y: Unit(b)})), explanation: 'division by zero'}));
        return Ok(Unit(rv));
      }),
      '^': _binOp('^', asUnit, asNeutral, (a, b) => {
        const rv = a.pow(b);
        if (!rv)
          return Err(NotInDomain({
            value: Table(Map({x: Unit(a), y: Unit(b)})),
            explanation: 'can only compute x^y if y is an integer neutral unit and x is not negative'
          }));
        return Ok(Unit(rv));
      }),
      '^/': _binOp('^/', asUnit, asNeutral, (a, b) => {
        const rv = a.root(b);
        if (!rv)
          return Err(NotInDomain({
            value: Table(Map({x: Unit(a), y: Unit(b)})),
            explanation: 'can only compute x^(1/y) if y is a non-zero integer neutral unit and x is not negative (unless y is odd)',
          }));
        return Ok(Unit(rv));
      }),
      '<': _binOp('<', asUnit, asUnit, (a, b) => {
        if (!dimEq(a.dim, b.dim))
          return Err(DimensionMismatch({left: a.dim, right: b.dim}));
        return Ok(Bool(a.value.lt(b.value)));
      }),
      '>': _binOp('>', asUnit, asUnit, (a, b) => {
        if (!dimEq(a.dim, b.dim))
          return Err(DimensionMismatch({left: a.dim, right: b.dim}));
        return Ok(Bool(a.value.gt(b.value)));
      }),
      '<=': _binOp('<=', asUnit, asUnit, (a, b) => {
        if (!dimEq(a.dim, b.dim))
          return Err(DimensionMismatch({left: a.dim, right: b.dim}));
        return Ok(Bool(a.value.lte(b.value)));
      }),
      '>=': _binOp('>=', asUnit, asUnit, (a, b) => {
        if (!dimEq(a.dim, b.dim))
          return Err(DimensionMismatch({left: a.dim, right: b.dim}));
        return Ok(Bool(a.value.gte(b.value)));
      }),

      '~=': _binOp('~=', asAny, asAny, (a, b) => Ok(Bool(_weakEquality(a, b)))),

      '.=': _binOp('.=', asSymb, asAny, (name, value, env) => {
        h.setName(name, value);
        return {ok: value};
      }),

      'meters': Native({
        name: 'meters',
        fun: input => Ei.map(asNeutral(input), v => Unit(v, {'L': new Fraction(1)}))
      }),
      'kilograms': Native({
        name: 'kilograms',
        fun: input => Ei.map(asNeutral(input), v => Unit(v, {'M': new Fraction(1)}))
      }),
      'seconds': Native({
        name: 'seconds',
        fun: input => Ei.map(asNeutral(input), v => Unit(v, {'T': new Fraction(1)}))
      }),

      '++': _binOp('++', asStr, asStr, (a, b) => Ok(Str(a + b))),
      '<<': _binOpId('<<', (a, b) => Ok(compose(a, b))),
      '>>': _binOpId('>>', (a, b) => Ok(compose(b, a))),
      '|>': _binOpId('|>', (a, f, env) => applyFunction(f, a, env)),

      '$': _binOpId('$', (f, a, env) => applyFunction(f, a, env)),
      '$|': _binOpId('$|', (f, a, env) => applyFunction(f, a, env)),

      'true': Bool(true),
      'false': Bool(false),

      'fallback': _fallback,
      '|?': _fallback,

      'Str': ModuleStr,

      'Sym': ModuleSym,

      'Refl': ModuleRefl(h),

      'IO': ModuleIO(h),

      'Imp': ModuleImp,
    })
  };
};
