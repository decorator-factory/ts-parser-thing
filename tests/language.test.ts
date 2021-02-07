import { Parser, parser } from '../src/parser';
import * as Lang from '../src/language';
import * as Comb from '../src/combinators';
import { expect } from 'chai';

describe('manyLazy', () => {
  const stream = [
    {type: 'foo', position: 1, content: 'aaaaa'},
    {type: 'foo', position: 2, content: 'bbbbbbbbbbbbb'},
    {type: 'foo', position: 3, content: 'ccccccccc'},
    {type: 'bar', position: 4, content: 'dddd'},
    {type: 'foo', position: 5, content: 'eeeeeeee'},
  ];

  it('finds many occurences of a pattern in a stream', () => {
    const p = Lang.manyLazy(Lang.oneOf('foo'));
    expect(p.parse(stream))
      .to.deep.equal({
        ok: [ stream.slice(0, 3), stream.slice(3) ]
      })
  });

  it("doesn't fail when no pattern is found", () => {
    const p = Lang.manyLazy(Lang.oneOf('baz'));
    expect(p.parse(stream))
      .to.deep.equal({
        ok: [ [], stream ]
      })
  });
});


describe('calculator I', () => {
  type T = 'number' | 'operator';
  type P<A> = Lang.TokenParser<T, A>

  const stream: Lang.TokenStream<T> = [
    {type: 'number', position: 0, content: '37'},
    {type: 'operator', position: 1, content: '+'},
    {type: 'number', position: 2, content: '5'},
  ];
  const numParser: P<number> = Lang.reading('number', parseInt);

  it('can parse a number', () => {
    expect(numParser.parse(stream))
      .to.have.property('ok')
      .which.deep.equals([37, stream.slice(1)])
  });

  it('can parse a simple infix expression with concat & tuple', () => {
    const infixParser: P<[number, string, number]> =
      Comb.concat(
        Comb.tuple(numParser, Lang.reading('operator', c => c)),
        numParser
      );
    expect(infixParser.parse(stream))
      .to.have.property('ok')
      .which.deep.equals([[37, '+', 5], []])
  });

  it('can parse a simple infix expression with concats', () => {
    const infixParser2: P<[number, string, number]> =
      Comb.concats(numParser, Lang.reading('operator', c => c), numParser);
    expect(infixParser2.parse(stream))
      .to.have.property('ok')
      .which.deep.equals([[37, '+', 5], []])
  });
});


describe('calculator II', () => {
  type T = 'number' | 'lpar' | 'rpar';
  type P<A> = Lang.TokenParser<T, A>

  const stream: Lang.TokenStream<T> = [
    {type: 'lpar', position: 0, content: '('},
    {type: 'lpar', position: 1, content: '('},
    {type: 'lpar', position: 2, content: '('},
    {type: 'lpar', position: 3, content: '('},
    {type: 'number', position: 4, content: '42'},
    {type: 'rpar', position: 5, content: ')'},
    {type: 'rpar', position: 6, content: ')'},
    {type: 'rpar', position: 7, content: ')'},
    {type: 'rpar', position: 8, content: ')'},
  ];
  const numParser: P<number> = Lang.reading('number', parseInt);

  const numInParens: P<number> = Comb.surroundedBy(
    Lang.oneOf('lpar'),
    Comb.lazy(() => numInParens.or(numParser)),
    Lang.oneOf('rpar')
  );

  it('finds a number nested in several layers of ( and )', () => {
    expect(numInParens.parse(stream))
      .to.have.property('ok')
      .which.deep.equals([42, []]);
  })
});
