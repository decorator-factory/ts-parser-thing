import { Either, Err, Ok } from '../src/either';
import { Interpreter, IOHandle, LangError } from '../src/lang/interpreter';
import * as rt from '../src/lang/runtime';
import * as ast from '../src/lang/ast';
import Big from 'big.js';
import { assert } from 'chai';
import { inspect } from 'util';
import { pureIOHandle, testIO, testPure } from './_helpers';



describe('The interpreter should evaluate an AST', () => {
  it('((+ 3) 5) is 8', () => {
    const i = new Interpreter(pureIOHandle);

    const expr = ast.App({
      fun: ast.App({
        fun: ast.Name('+'),
        arg: ast.Dec(Big(3))
      }),
      arg: ast.Dec(Big(5))
    });
    const result = i.runAst(expr);

    assert.deepEqual(result, Ok(rt.Unit(8)));
  });

  it('((x. x) 42) is 42', () => {
    const i = new Interpreter(pureIOHandle);

    const lambda = ast.makeLambda(
      ast.ArgSingle('x'),
      ast.Name('x')
    );
    const expr = ast.App({
      fun: lambda,
      arg: ast.Dec(Big(42))
    });
    const result = i.runAst(expr);

    assert.deepEqual(result, Ok(rt.Unit(42)));
  });

  it('returns a runtime error when things go wrong', () => {
    const i = new Interpreter(pureIOHandle);

    const expr = ast.Name('thisNameIsNotDefined');
    const result = i.runAst(expr);

    const runtimeError: rt.RuntimeError = rt.UndefinedName('thisNameIsNotDefined');
    const langError: LangError = {type: 'runtimeError', err: runtimeError};

    assert.deepEqual(result, Err(langError));
  })
});


describe('The interpreter integrates the parser and the runtime', () => {
  testPure('2 + 2 = 4', '2 + 2', '4');
  testPure('3000 * 5.1 = 15300', '3000 * 5.1', '15300');
  testPure('reports tokenization (lexing) errors', 'жжж', {error: 'lexError'});
  testPure('reports parsing errors', '()[[[', {error: 'parseError'});
  testIO(
    'can interact with I/O',
    'IO:log (IO:readLine {})',
    ['hello'],
    ['hello']
  );
});