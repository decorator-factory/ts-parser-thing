import * as p from '../src/lang/parser';
import * as ast from '../src/lang/ast';
import { ParseOptions, Prio } from '../src/lang/ast';
import { assert } from 'chai';
import { Tok } from '../src/lang/lexer';
import { TokenStream } from '../src/language';
import { Ok } from '../src/either';
import Big from 'big.js';

describe('The `unparse` function turns AST back to source code', () => {
  it('works with names', () => {
    assert.deepEqual(
      p.unparse(ast.Name('foo')),
      'foo'
    );
  });

  it('works with operators', () => {
    assert.deepEqual(
      p.unparse(ast.Name('>=>')),
      '(>=>)'
    );
  });

  it('works with numbers', () => {
    assert.deepEqual(
      p.unparse(ast.Dec(Big(666.5))),
      '666.5'
    );
  });

  it('works with strings', () => {
    assert.deepEqual(
      p.unparse(ast.Str('quack')),
      '"quack"'
    );
  });

  it('works with symbols', () => {
    assert.deepEqual(
      p.unparse(ast.Symbol('iAmASymbol')),
      ':iAmASymbol'
    );
  });

  it('works with tables', () => {
    assert.deepEqual(
      p.unparse(ast.Table([
        ['x', ast.Name('y')],
        ['z', ast.Table([])]
      ])),
      '{x: y, z: {}}'
    );
  });

  describe('Works with function application', () => {
    it('puts application in parentheses', () => {
      assert.deepEqual(
        p.unparse(ast.App({fun: ast.Name('f'), arg: ast.Name('x')})),
        '(f x)'
      );
    });

    it('squishes nested applications into one, just like in source', () => {
      assert.deepEqual(
        p.unparse(ast.App({
          fun: ast.App({
            fun: ast.App({
              fun: ast.Name('f'),
              arg: ast.Name('x')
            }),
            arg: ast.Name('y')
          }),
          arg: ast.Name('z')
        })),
        '(f x y z)'
      );
    });

    it('formats operator application in an infix way', () => {
      assert.deepEqual(
        p.unparse(ast.App({
          fun: ast.App({
            fun: ast.Name('+'),
            arg: ast.Name('x')
          }),
          arg: ast.Name('y')
        })),
        '((+) x y)'
      );
    });
  });

  it('works with conditionals', () => {
    assert.deepEqual(
      p.unparse(ast.Cond({
        if: ast.Name('a'),
        then: ast.Name('b'),
        else: ast.Name('c'),
      })),
      'if a then b else c'
    );
  });

  describe('Works with function definitions', () => {
    it('works with the simple identity function', () => {
      assert.deepEqual(
        p.unparse(ast.makeLambda(ast.ArgSingle('x'), ast.Name('x'))),
        '(x. x)'
      )
    });

    it('squishes nested functions into one, just like in source', () => {
      assert.deepEqual(
        p.unparse(
          ast.makeLambda(
            ast.ArgSingle('x'),
            ast.makeLambda(
              ast.ArgSingle('y'),
              ast.makeLambda(ast.ArgSingle('z'), ast.Name('y'))
            )
          )
        ),
        '(x y z. y)'
      )
    });

    it('works with table parameters', () => {
      const param = ast.ArgTable([
        ['a', ast.ArgSingle('b')],
        ['c', ast.ArgTable([
          ['d', ast.ArgSingle('e')],
          ['f', ast.ArgSingle('g')],
        ])],
      ]);
      assert.deepEqual(
        p.unparse(ast.makeLambda(param, ast.Dec(Big('3.14')))),
        '({a: b, c: {d: e, f: g}}. 3.14)'
      )
    });

    it('squishes table parameter shorthands, just like in source', () => {
      const param = ast.ArgTable([
        ['a', ast.ArgSingle('b')],
        ['c', ast.ArgSingle('c')],
      ]);
      assert.deepEqual(
        p.unparse(ast.makeLambda(param, ast.Dec(Big('3.14')))),
        '({a: b, c}. 3.14)'
      )
    });

    it('works with mixed parameters in curried functions', () => {
      const param0 = ast.ArgSingle('x');
      const param1 = ast.ArgTable([
        ['a', ast.ArgSingle('b')],
        ['c', ast.ArgSingle('c')],
      ]);
      const param2 = ast.ArgSingle('y');
      assert.deepEqual(
        p.unparse(
          ast.makeLambda(
            param0,
            ast.makeLambda(
              param1,
              ast.makeLambda(
                param2,
                ast.Dec(Big('3.14'))
              )
            )
          )
        ),
        '(x {a: b, c} y. 3.14)'
      )
    });
  });

  it('detects left operator sections', () => {
    assert.deepEqual(
      p.unparse(
        ast.makeLambda(ast.ArgSingle('_'), ast.App({
          fun: ast.App({
            fun: ast.Name('*'),
            arg: ast.Name('_')
          }),
          arg: ast.Dec(Big(5)),
        }))
      ),
      '(* 5)'
    )
  });

  it("replaces deep nesting with '...'", () => {
    const pair: [string, ast.Expr] = ['x', ast.Str('')];
    const tableThatContainsItself = ast.Table([pair]);
    pair[1] = tableThatContainsItself;
    assert.include(
      p.unparse(tableThatContainsItself),
      '{x: ...}'
    );
  });
})