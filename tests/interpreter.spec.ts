import { Either, Err, Ok } from '../src/either';
import { Interpreter, IOHandle, LangError } from '../src/lang/interpreter';
import * as rt from '../src/lang/runtime';
import * as ast from '../src/lang/ast';
import Big from 'big.js';
import { assert } from 'chai';
import { inspect } from 'util';



export const pureIOHandle: IOHandle = {
  exit: () => {},
  writeLine: line => {},
  readLine: () => '',
};


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


const test = (description: string, input: string, output: string | {ok: rt.Value} | {error: LangError['type']}) => {
  it(description, () => {
    const actual = new Interpreter(pureIOHandle).runLine(input);

    if (typeof output === 'string') {
      const expected = new Interpreter(pureIOHandle).runLine(output);
      assert.deepEqual(expected, actual)
    } else if ('ok' in output) {
      assert.deepEqual({ok: output.ok}, actual);
    } else {
      assert.property(actual, 'err');
      assert.deepEqual((actual as any).err.type, output.error);
    }
  })
};


const testIO = (
  description: string,
  code: string,
  stdin: readonly string[],
  expectedStdout: readonly string[],
) => {
  let lineIndex = 0;
  const actualStdout: string[] = [];

  const handle: IOHandle = {
    readLine: () => {
      if (lineIndex >= stdin.length)
        throw new Error('End of input');
      const line = stdin[lineIndex];
      lineIndex++;
      return line;
    },
    writeLine: line => actualStdout.push(line),
    exit: () => {}
  };


  it(description, () => {
    const i = new Interpreter(handle);
    const rv = i.runMultiline(code);
    if (!('ok' in rv))
      assert.fail(`Expected success, got: ${inspect(rv, {depth:null})}`);
    assert.deepEqual(actualStdout, expectedStdout);
  })
};


describe('The interpreter integrates the parser and the runtime', () => {
  test('2 + 2 = 4', '2 + 2', '4');
  test('3000 * 5.1 = 15300', '3000 * 5.1', '15300');
  test('reports tokenization (lexing) errors', 'жжж', {error: 'lexError'});
  test('reports parsing errors', '()[[[', {error: 'parseError'});
  testIO(
    'can interact with I/O',
    'IO:log (IO:readLine {})',
    ['hello'],
    ['hello']
  );
});