import { Interpreter, IOHandle, LangError } from '../src/lang/interpreter';
import * as rt from '../src/lang/runtime';
import { assert } from 'chai';
import { inspect } from 'util';


export const pureIOHandle: IOHandle = {
  exit: () => {},
  writeLine: _line => {},
  readLine: () => '',
};


export const testPure = (
  description: string,
  input: string,
  output: string | {ok: rt.Value} | {error: LangError['type']}
) => {
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


export const testIO = (
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