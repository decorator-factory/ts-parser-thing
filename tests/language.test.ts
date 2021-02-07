import { Parser, parser } from '../src/parser';
import * as Lang from '../src/language';
import * as Comb from '../src/combinators';
import { expect } from 'chai';

describe('manyLazy', () => {
  const L = new Lang.Lang<'foo'|'bar'|'baz'>();
  const stream: Lang.TokenStream<'foo'|'bar'|'baz'> = [
    {type: 'foo', position: 1, content: 'aaaaa'},
    {type: 'foo', position: 2, content: 'bbbbbbbbbbbbb'},
    {type: 'foo', position: 3, content: 'ccccccccc'},
    {type: 'bar', position: 4, content: 'dddd'},
    {type: 'foo', position: 5, content: 'eeeeeeee'},
  ];

  it('finds many occurences of a pattern in a stream', () => {
    const p = Comb.many(L.oneOf('foo'));
    expect(p.parse(stream))
      .to.deep.equal({
        ok: [ stream.slice(0, 3), stream.slice(3) ]
      })
  });

  it("doesn't fail when no pattern is found", () => {
    const p = Comb.many(L.oneOf('baz'));
    expect(p.parse(stream))
      .to.deep.equal({
        ok: [ [], stream ]
      })
  });
});


describe('calculator I', () => {
  type T = 'number' | 'operator';
  const L = new Lang.Lang<T>();
  type P<A> = Lang.TokenParser<T, A>

  const stream: Lang.TokenStream<T> = [
    {type: 'number', position: 0, content: '37'},
    {type: 'operator', position: 1, content: '+'},
    {type: 'number', position: 2, content: '5'},
  ];
  const numParser = L.reading('number', parseInt);

  it('can parse a number', () => {
    expect(numParser.parse(stream))
      .to.have.property('ok')
      .which.deep.equals([37, stream.slice(1)])
  });

  it('can parse a simple infix expression with concat & tuple', () => {
    const infixParser =
      Comb.concat(
        Comb.pair(numParser, L.reading('operator', c => c)),
        numParser
      );
    expect(infixParser.parse(stream))
      .to.have.property('ok')
      .which.deep.equals([[37, '+', 5], []])
  });

  it('can parse a simple infix expression with concats', () => {
    const infixParser2: P<[number, string, number]> =
      Comb.concats(numParser, L.reading('operator', c => c), numParser);
    expect(infixParser2.parse(stream))
      .to.have.property('ok')
      .which.deep.equals([[37, '+', 5], []])
  });
});


describe('calculator II', () => {
  type T = 'number' | 'lpar' | 'rpar';
  type P<A> = Lang.TokenParser<T, A>
  const L = new Lang.Lang<T>();

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
  const numParser = L.reading('number', parseInt);

  const numInParens: P<number> = Comb.surroundedBy(
    L.oneOf('lpar'),
    Comb.lazy(() => numInParens.or(numParser)),
    L.oneOf('rpar')
  );

  it('finds a number nested in several layers of ( and )', () => {
    expect(numInParens.parse(stream))
      .to.have.property('ok')
      .which.deep.equals([42, []]);
  })
});



describe('calculator III', () => {
  type T = 'number' | 'lpar' | 'rpar' | 'times';
  type P<A> = Lang.TokenParser<T, A>
  const L = new Lang.Lang<T>();

  const num = L.reading('number', parseInt);

  const parenthesizedExpr: P<number> = Comb.surroundedBy(
    L.oneOf('lpar'),
    Comb.lazy(() => product),
    L.oneOf('rpar')
  );

  const atomic = num.or(parenthesizedExpr);

  const product =
    Comb.concat(
      Comb.many(atomic.neht(L.oneOf('times'))),
      atomic
    ).map(arr => arr.reduce((a, b) => a * b, 1));

  it('finds a product without parentheses', () => {
    const stream: Lang.TokenStream<T> = [
      {type: 'number', position: 0, content: '2'},
      {type: 'times', position: 1, content: '*'},
      {type: 'number', position: 2, content: '3'},
      {type: 'times', position: 3, content: '*'},
      {type: 'number', position: 4, content: '4'},
    ];
    expect(product.parse(stream))
      .to.have.property('ok')
      .which.deep.equals([24, []]);
  });

  it('finds a product with parentheses', () => {
    const stream: Lang.TokenStream<T> = [
      {type: 'number', position: 0 , content: '2' },
      {type: 'times' , position: 1 , content: '*' },
      {type: 'lpar'  , position: 2 , content: '(' },
      {type: 'number', position: 3 , content: '3' },
      {type: 'times' , position: 4 , content: '*' },
      {type: 'number', position: 5 , content: '4' },
      {type: 'times' , position: 6 , content: '*' },
      {type: 'lpar'  , position: 7 , content: '(' },
      {type: 'number', position: 8 , content: '10'},
      {type: 'times' , position: 9 , content: '*' },
      {type: 'number', position: 10, content: '2' },
      {type: 'rpar'  , position: 11, content: ')' },
      {type: 'times' , position: 12, content: '*' },
      {type: 'number', position: 13, content: '10'},
      {type: 'rpar'  , position: 14, content: ')' },
    ];
    expect(product.parse(stream))
      .to.have.property('ok')
      .which.deep.equals([2 * (3 * 4 * (10 * 2) * 10), []]);
  })
});



describe('calculator IV', () => {
  type T = 'number' | 'lpar' | 'rpar' | 'times' | 'plus';
  type P<A> = Lang.TokenParser<T, A>
  const L = new Lang.Lang<T>();

  const num = L.reading('number', parseInt);

  const parenthesizedSum: P<number> = Comb.surroundedBy(
    L.oneOf('lpar'),
    Comb.lazy(() => sum),
    L.oneOf('rpar')
  );

  const atomic = num.or(parenthesizedSum);

  const product =
    Comb.concat(
      Comb.many(atomic.neht(L.oneOf('times'))),
      atomic
    ).map(arr => arr.reduce((a, b) => a * b, 1));

  const sum =
    Comb.concat(
      Comb.many(product.neht(L.oneOf('plus'))),
      product
    ).map(arr => arr.reduce((a, b) => a + b, 0));

  it('evaluates an expression with + and *', () => {
    const stream: Lang.TokenStream<T> = [
      {type: 'number', position: 0 , content: '2' },
      {type: 'times' , position: 1 , content: '*' },
      {type: 'lpar'  , position: 2 , content: '(' },
      {type: 'number', position: 3 , content: '3' },
      {type: 'plus'  , position: 4 , content: '+' },
      {type: 'number', position: 5 , content: '4' },
      {type: 'times' , position: 6 , content: '*' },
      {type: 'lpar'  , position: 7 , content: '(' },
      {type: 'number', position: 8 , content: '10'},
      {type: 'plus'  , position: 9 , content: '+' },
      {type: 'number', position: 10, content: '2' },
      {type: 'rpar'  , position: 11, content: ')' },
      {type: 'times' , position: 12, content: '*' },
      {type: 'number', position: 13, content: '10'},
      {type: 'times' , position: 12, content: '*' },
      {type: 'number', position: 13, content: '10'},
      {type: 'plus'  , position: 12, content: '+' },
      {type: 'number', position: 13, content: '15'},
      {type: 'plus'  , position: 14, content: '+' },
      {type: 'number', position: 15, content: '20'},
      {type: 'rpar'  , position: 16, content: ')' },
    ];
    expect(sum.parse(stream))
      .to.have.property('ok')
      .which.deep.equals([2 * (3 + 4 * (10 + 2) * 10 * 10 + 15 + 20), []]);
  })
});
