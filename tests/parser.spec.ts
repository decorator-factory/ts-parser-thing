import * as p from '../src/lang/parser';
import * as ast from '../src/lang/ast';
import { ParseOptions, Prio } from '../src/lang/ast';
import { assert } from 'chai';
import { Tok } from '../src/lang/lexer';
import { TokenStream } from '../src/language';
import { Ok } from '../src/either';
import Big from 'big.js';


const defaultOptions : ParseOptions = {
  priorities: {
    '+': Prio(6, 'left'),
    '-': Prio(6, 'left'),
    '*': Prio(8, 'left'),
    '|?': Prio(3, 'right'),
  },
  backtickPriority: Prio(20, 'right'),
  defaultPriority: Prio(5, 'left'),
};
const [defaultParser] = p.makeParser(defaultOptions);



const tok = (type: Tok, position: number, content: string) =>
  ({type, position, content});


describe('The parser turns a token stream into an AST', () => {
  it('requires options to run', () => {
    // @ts-expect-error
    const parser = p.makeParser();
  });

  it('parses a name token as a name', () => {
    const stream: TokenStream<Tok> = [
      tok('name', 0, 'foo'),
    ];

    const actual = defaultParser.parse(stream);
    const expected: typeof actual = Ok([ast.Name('foo'), []]);

    assert.deepEqual(actual, expected);
  });

  it('parses two names side-by-side as a simple function application', () => {
    const stream: TokenStream<Tok> = [
      tok('name', 0, 'foo'),
      tok('name', 4, 'bar'),
    ];

    const actual = defaultParser.parse(stream);
    const expected: typeof actual = Ok([
      ast.App({
        fun: ast.Name('foo'),
        arg: ast.Name('bar'),
      }),
      []
    ]);

    assert.deepEqual(actual, expected);
  });

  it('function application works with more than 1 argument', () => {
    const stream: TokenStream<Tok> = [
      tok('name', 0, 'a'),
      tok('name', 2, 'b'),
      tok('name', 4, 'c'),
      tok('name', 2, 'd'),
    ];

    const actual = defaultParser.parse(stream);
    const expected: typeof actual = Ok([
      ast.App({
        fun: ast.App({
          fun: ast.App({
            fun: ast.Name('a'),
            arg: ast.Name('b'),
          }),
          arg: ast.Name('c'),
        }),
        arg: ast.Name('d'),
      }),
      []
    ]);

    assert.deepEqual(actual, expected);
  });

  it('conditional expressions work', () => {
    const stream: TokenStream<Tok> = [
      tok('if',   0,  'if'),
      tok('name', 3,  'a'),
      tok('then', 5,  'then'),
      tok('name', 10, 'b'),
      tok('else', 12, 'else'),
      tok('dec',  17, '42'),
    ];

    const actual = defaultParser.parse(stream);
    const expected: typeof actual = Ok([
      ast.Cond({
        if: ast.Name('a'),
        then: ast.Name('b'),
        else: ast.Dec(Big(42))
      }),
      []
    ]);

    assert.deepEqual(actual, expected);
  });

  describe('Function definitions', () => {
    it('can have a single name as a parameter', () => {
      const stream: TokenStream<Tok> = [
        tok('name', 0, 'x'),
        tok('dot',  1, '.'),
        tok('name', 0, 'y'),
      ];

      const actual = defaultParser.parse(stream);
      const expected: typeof actual = Ok([
        ast.makeLambda(
          ast.ArgSingle('x'),
          ast.Name('y'),
        ),
        []
      ]);

      assert.deepEqual(actual, expected);
    });

    it('can have multiple parameters, with currying', () => {
      const stream: TokenStream<Tok> = [
        tok('name', 0, 'x'),
        tok('name', 2, 'y'),
        tok('dot',  3, '.'),
        tok('name', 4, 'z'),
      ];

      const actual = defaultParser.parse(stream);
      const expected: typeof actual = Ok([
        ast.makeLambda(
          ast.ArgSingle('x'),
          ast.makeLambda(
            ast.ArgSingle('y'),
            ast.Name('z')
          ),
        ),
        []
      ]);

      assert.deepEqual(actual, expected);
    })

    it('can have a table as a parameter', () => {
      const stream: TokenStream<Tok> = [
        tok('lbr',   0, '{'),
        tok('name',  1, 'x'),
        tok('col',   2, ':'),
        tok('name',  4, 'y'),
        tok('comma', 5, ','),
        tok('name',  7, 'z'),
        tok('rbr',   8, '}'),
        tok('dot',   1, '.'),
        tok('name',  0, 'w'),
      ];

      const actual = defaultParser.parse(stream);
      const expected: typeof actual = Ok([
        ast.makeLambda(
          ast.ArgTable([
            ['x', ast.ArgSingle('y')],
            ['z', ast.ArgSingle('z')],
          ]),
          ast.Name('w'),
        ),
        []
      ]);

      assert.deepEqual(actual, expected);
    });

    it('can nest table parameters', () => {
      const stream: TokenStream<Tok> = [
        tok('lbr',   0, '{'),
        tok('name',  1, 'x'),
        tok('col',   2, ':'),
        tok('lbr',   3, '{'),
        tok('name',  4, 'y'),
        tok('rbr',   5, '}'),
        tok('comma', 6, ','),
        tok('name',  7, 'z'),
        tok('rbr',   8, '}'),
        tok('dot',   1, '.'),
        tok('name',  0, 'w'),
      ];

      const actual = defaultParser.parse(stream);
      const expected: typeof actual = Ok([
        ast.makeLambda(
          ast.ArgTable([
            ['x', ast.ArgTable([['y', ast.ArgSingle('y')]])],
            ['z', ast.ArgSingle('z')],
          ]),
          ast.Name('w'),
        ),
        []
      ]);

      assert.deepEqual(actual, expected);
    });

    it('can mix table parameters with named parameters', () => {
      const stream: TokenStream<Tok> = [
        tok('name',  0,  'a'),
        tok('lbr',   2,  '{'),
        tok('name',  3,  'x'),
        tok('col',   4,  ':'),
        tok('lbr',   6,  '{'),
        tok('name',  7,  'y'),
        tok('rbr',   8,  '}'),
        tok('comma', 9,  ','),
        tok('name',  11, 'z'),
        tok('rbr',   12, '}'),
        tok('name',  14, 'b'),
        tok('dot',   15, '.'),
        tok('name',  17, 'w'),
      ];

      const actual = defaultParser.parse(stream);
      const expected: typeof actual = Ok([
        ast.makeLambda(
          ast.ArgSingle('a'),
          ast.makeLambda(
            ast.ArgTable([
              ['x', ast.ArgTable([['y', ast.ArgSingle('y')]])],
              ['z', ast.ArgSingle('z')],
            ]),
            ast.makeLambda(
              ast.ArgSingle('b'),
              ast.Name('w'),
            )
          ),
        ),
        []
      ]);

      assert.deepEqual(actual, expected);
    });
  });

  describe('Operator sections', () => {
    describe('Right operator sections', () => {
      it('is just partial application of an operator', () => {
        const stream: TokenStream<Tok> = [
          tok('lp',   0, '('),
          tok('name', 1, 'foo'),
          tok('op',   5, '+'),
          tok('rp',   6, ')'),
        ];

        const actual = defaultParser.parse(stream);
        const expected: typeof actual = Ok([
          ast.App({
            fun: ast.Name('+'),
            arg: ast.Name('foo'),
          }),
          []
        ]);

        assert.deepEqual(actual, expected);
      });

      it('can use backticked expressions instead of an operator (why not?)', () => {
        const stream: TokenStream<Tok> = [
          tok('lp',       0, '('),
          tok('name',     1, 'foo'),
          tok('backtick', 5, '`'),
          tok('name',     6, 'bar'),
          tok('backtick', 9, '`'),
          tok('rp',       10, ')'),
        ];

        const actual = defaultParser.parse(stream);
        const expected: typeof actual = Ok([
          ast.App({
            fun: ast.Name('bar'),
            arg: ast.Name('foo'),
          }),
          []
        ]);

        assert.deepEqual(actual, expected);
      });
    });

    describe('Left operator sections', () => {
      it('are treated as lambdas: (+ x) == (_. _ + x)', () => {
        const stream: TokenStream<Tok> = [
          tok('lp',   0, '('),
          tok('op',   1, '+'),
          tok('name', 3, 'foo'),
          tok('rp',   6, ')'),
        ];

        const actual = defaultParser.parse(stream);
        const expected: typeof actual = Ok([
          ast.makeLambda(
            ast.ArgSingle('_'),
            ast.App({
              fun: ast.App({
                fun: ast.Name('+'),
                arg: ast.Name('_')
              }),
              arg: ast.Name('foo'),
            })
          ),
          []
        ]);

        assert.deepEqual(actual, expected);
      });

      it('can use backticked expressions instead of an operator', () => {
        const stream: TokenStream<Tok> = [
          tok('lp',       0, '('),
          tok('backtick', 1, '`'),
          tok('name',     2, 'bar'),
          tok('backtick', 5, '`'),
          tok('name',     7, 'foo'),
          tok('rp',       10, ')'),
        ];

        const actual = defaultParser.parse(stream);
        const expected: typeof actual = Ok([
          ast.makeLambda(
            ast.ArgSingle('_'),
            ast.App({
              fun: ast.App({
                fun: ast.Name('bar'),
                arg: ast.Name('_')
              }),
              arg: ast.Name('foo'),
            })
          ),
          []
        ]);

        assert.deepEqual(actual, expected);
      });
    });
  });

  describe('Table literals', () => {
    it('can be empty', () => {
      const stream: TokenStream<Tok> = [
        tok('lbr', 0, '{'),
        tok('rbr', 1, '}'),
      ];

      const actual = defaultParser.parse(stream);
      const expected: typeof actual = Ok([ast.Table([]), []]);

      assert.deepEqual(actual, expected)
    });

    it('can have one entry', () => {
      const stream: TokenStream<Tok> = [
        tok('lbr',  0, '{'),
        tok('name', 1, 'x'),
        tok('col',  2, ':'),
        tok('dec',  4, '36'),
        tok('rbr',  6, '}'),
      ];

      const actual = defaultParser.parse(stream);
      const expected: typeof actual = Ok([
        ast.Table([
          ['x', ast.Dec(Big(36))]
        ]),
        []
      ]);

      assert.deepEqual(actual, expected)
    });

    it('can have multiple entries', () => {
      const stream: TokenStream<Tok> = [
        tok('lbr',   0,  '{'),
        tok('name',  1,  'x'),
        tok('col',   2,  ':'),
        tok('dec',   4,  '1'),
        tok('comma', 5,  ','),
        tok('name',  7,  'y'),
        tok('col',   8,  ':'),
        tok('dec',   9,  '2'),
        tok('rbr',   10, '}'),
      ];

      const actual = defaultParser.parse(stream);
      const expected: typeof actual = Ok([
        ast.Table([
          ['x', ast.Dec(Big(1))],
          ['y', ast.Dec(Big(2))],
        ]),
        []
      ]);

      assert.deepEqual(actual, expected)
    });

    it('can use operators as keys', () => {
      const stream: TokenStream<Tok> = [
        tok('lbr',  0, '{'),
        tok('op',   1, '>>='),
        tok('col',  4, ':'),
        tok('name', 6, 'bind'),
        tok('rbr',  10, '}'),
      ];

      const actual = defaultParser.parse(stream);
      const expected: typeof actual = Ok([
        ast.Table([
          ['>>=', ast.Name('bind')]
        ]),
        []
      ]);

      assert.deepEqual(actual, expected)
    });
  });

  describe('Infix operators are tricky', () => {
    const app = (f: ast.Expr | string, a: ast.Expr | string): ast.Expr => {
      const fun = typeof f === 'string' ? ast.Name(f) : f;
      const arg = typeof a === 'string' ? ast.Name(a) : a;
      return ast.App({fun, arg});
    }

    it('takes operator priorities from the ParserOptions', () => {
      const opts: ParseOptions = {
        ...defaultOptions,
        priorities: {
          '+': Prio(6, 'left'),
          '*': Prio(8, 'left'),
        },
      };
      const [parser] = p.makeParser(opts);

      const stream: TokenStream<Tok> = [
        tok('name', 0,  'a'),
        tok('op',   2,  '+'),
        tok('name', 4,  'b'),
        tok('op',   6,  '*'),
        tok('name', 8,  'c'),
        tok('op',   10, '+'),
        tok('name', 12, 'd'),
      ];
      const B_TIMES_C = app(app('*', 'b'), 'c');
      const A_PLUS_B_TIMES_C = app(app('+', 'a'), B_TIMES_C);
      const expr = app(app('+', A_PLUS_B_TIMES_C), 'd');

      const actual = parser.parse(stream);
      const expected: typeof actual = Ok([expr, []]);

      assert.deepEqual(actual, expected);
    });

    it('if + is left-associative, a + b + c means (a + b) + c', () => {
      const opts: ParseOptions = {
        ...defaultOptions,
        priorities: {
          '+': Prio(6, 'left'),
        },
      };
      const [parser] = p.makeParser(opts);

      const stream: TokenStream<Tok> = [
        tok('name', 0,  'a'),
        tok('op',   2,  '+'),
        tok('name', 4,  'b'),
        tok('op',   6,  '+'),
        tok('name', 8,  'c'),
      ];

      const A_PLUS_B = app(app('+', 'a'), 'b');
      const expr = app(app('+', A_PLUS_B), 'c');

      const actual = parser.parse(stream);
      const expected: typeof actual = Ok([expr, []])

      assert.deepEqual(actual, expected);
    });

    it('if |? is right-associative, a |? b |? c means a |? (b |? c)', () => {
      const opts: ParseOptions = {
        ...defaultOptions,
        priorities: {
          '|?': Prio(6, 'right'),
        },
      };
      const [parser] = p.makeParser(opts);

      const stream: TokenStream<Tok> = [
        tok('name', 0,  'a'),
        tok('op',   2,  '|?'),
        tok('name', 5,  'b'),
        tok('op',   7,  '|?'),
        tok('name', 10,  'c'),
      ];

      const B_OR_C = app(app('|?', 'b'), 'c');
      const expr = app(app('|?', 'a'), B_OR_C);

      const actual = parser.parse(stream);
      const expected: typeof actual = Ok([expr, []])

      assert.deepEqual(actual, expected);
    });

    it('uses backtickPriority for the priority of backticked expressions', () => {
      const opts: ParseOptions = {
        ...defaultOptions,
        priorities: {
          '+': Prio(3, 'left'),
        },
        backtickPriority: Prio(4, 'left')
      };
      const [parser] = p.makeParser(opts);

      const stream: TokenStream<Tok> = [
        tok('name',     0, 'a'),
        tok('op',       1, '+'),
        tok('name',     2, 'b'),
        tok('backtick', 3, '`'),
        tok('name',     4, 'f'),
        tok('backtick', 5, '`'),
        tok('name',     6, 'c'),
      ];

      const B_F_C = app(app('f', 'b'), 'c');
      const expr = app(app('+', 'a'), B_F_C)

      const actual = parser.parse(stream);
      const expected: typeof actual = Ok([expr, []]);

      assert.deepEqual(actual, expected);
    });

    it('uses defaultPriority with unknown operator', () => {
      const opts: ParseOptions = {
        ...defaultOptions,
        priorities: {},
        defaultPriority: Prio(5, 'right'),
      };
      const [parser] = p.makeParser(opts);

      const stream: TokenStream<Tok> = [
        tok('name', 0, 'a'),
        tok('op',   1, '&'),
        tok('name', 2, 'b'),
        tok('op',   3, '&'),
        tok('name', 4, 'c'),
      ];

      const expr = app(app('&', 'a'), app(app('&', 'b'), 'c'));
      const actual = parser.parse(stream);
      const expected: typeof actual = Ok([expr, []]);
    });

    it('allows changing options on the fly', () => {
      const opts1: ParseOptions = {
        ...defaultOptions,
        priorities: { '+': Prio(4, 'left') },
      };
      const opts2: ParseOptions = {
        ...defaultOptions,
        priorities: { '+': Prio(4, 'right') },
      };
      const [parser, setOptions] = p.makeParser(opts1);

      const stream: TokenStream<Tok> = [
        tok('name', 0, 'a'),
        tok('op',   1, '+'),
        tok('name', 2, 'b'),
        tok('op',   3, '+'),
        tok('name', 4, 'c'),
      ];

      const expr1 = app(app('+', app(app('+', 'a'), 'b')), 'c');
      const actual1 = parser.parse(stream);
      const expected1: typeof actual1 = Ok([expr1, []]);
      assert.deepEqual(actual1, expected1);

      setOptions(opts2);

      const expr2 = app(app('+', 'a'), app(app('+', 'b'), 'c'));
      const actual2 = parser.parse(stream);
      const expected2: typeof actual1 = Ok([expr2, []]);
      assert.deepEqual(actual2, expected2);
    })
  })
});
