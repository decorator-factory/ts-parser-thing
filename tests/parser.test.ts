import { Parser, parser } from '../src/parser';
import { expect } from 'chai';

describe('Parser for any single character', () => {
  const anyChar: Parser<string, string> =
    parser(src =>
      src === ''
      ? {err: {recoverable: true, msg: 'Empty string'}}
      : {ok: [src[0], src.slice(1)]}
    );

  it('fails on an empty string', () => {
    expect(anyChar.parse(''))
      .to.deep.equal({err: 'Empty string'});
  })

  it('grabs the first character', () => {
    expect(anyChar.parse('foo'))
      .to.have.property('ok').which.deep.equals(['f', 'oo']);
  })
});
