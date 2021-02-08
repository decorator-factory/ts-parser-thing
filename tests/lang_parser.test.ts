import { makeParser, unparse } from '../src/lang/parser'
import { lex } from '../src/lang/lexer';
import { Prio, App, Name, Num, Lam, Str, Table, IfThenElse } from '../src/lang/ast';
import { consume } from '../src/language';
import { expect } from 'chai';


const parser = makeParser({
  priorities: {
    '+': Prio(3, 'right'),
    '-': Prio(3, 'left'),
    '*': Prio(3, 'right'),
  },
  namePriority: Prio(9, 'right'),
  defaultPriority: Prio(8, 'right'),
});


describe('In this language', () => {
  it('a single name is a valid program', () => {
    expect(consume(parser, lex('FizzBuzz')))
      .to.have.property('ok')
      .that.deep.equals(
        Name('FizzBuzz')
      )
  })

  it('function application can be constructed', () => {
    expect(consume(parser, lex('foo bar')))
      .to.have.property('ok')
      .that.deep.equals(
        App(Name('foo'), Name('bar'))
      )
  })

  it('all functions are curried', () => {
    expect(consume(parser, lex('foo bar baz bang')))
      .to.have.property('ok')
      .that.deep.equals(
        App(App(App(Name('foo'), Name('bar')), Name('baz')), Name('bang'))
      )
  })

  it('infix operators exist', () => {
    expect(consume(parser, lex('1 + 2')))
      .to.have.property('ok')
      .that.deep.equals(
        App(App(Name('+'), Num(1)), Num(2))
      )
  })

  it('operator precedence is respected', () => {
    expect(consume(parser, lex('1 + 2 * 3')))
      .to.have.property('ok')
      .that.deep.equals(
        App(App(Name('+'), Num(1)), App(App(Name('*'), Num(2)), Num(3)))
      )
  })

  it('function application has the highest precedence', () => {
    expect(consume(parser, lex('1 + a b * 3')))
      .to.have.property('ok')
      .that.deep.equals(
        App(App(Name('+'), Num(1)), App(App(Name('*'), App(Name('a'), Name('b'))), Num(3)))
      )
  })

  it('a function can be applied in an infix way', () => {
    const infix = consume(parser, lex('a b `c` d e'));
    const prefix = consume(parser, lex('c (a b) (d e)'));

    expect(infix).to.deep.equal(prefix)
  })

  it('infix functions take precedence over operators', () => {
    const a = consume(parser, lex('a + b `c` d * e'));
    const b = consume(parser, lex('a + (b `c` d) * e'));

    expect(a).to.deep.equal(b)
  })

  it('...but not over function application', () => {
    const a = consume(parser, lex('a b `c` d e'));
    const b = consume(parser, lex('(a b) `c` (d e)'));

    expect(a).to.deep.equal(b)
  })

  it('lambdas exist', () => {
    expect(consume(parser, lex('{x: x + y}')))
      .to.have.property('ok')
      .that.deep.equals(
        Lam('x', App(App(Name('+'), Name('x')), Name('y')))
      )
  })

  it('lambdas can be nested', () => {
    expect(consume(parser, lex('{x: {y: x + y}}')))
      .to.have.property('ok')
      .that.deep.equals(
        Lam('x', Lam('y', App(App(Name('+'), Name('x')), Name('y'))))
      )
  })

  it('lambdas capture values by name from their environment', () => {
    expect(consume(parser, lex('{x: x + y}')))
      .to.have.property('ok')
      .that.has.property('capturedNames')
      .that.contains('+').and.contains('y')
  })

  it('however, some lambdas are self-contained', () => {
    expect(consume(parser, lex('{f: {x: f x}}')))
      .to.have.property('ok')
      .that.has.property('capturedNames')
      .that.is.empty
  })

  it('multi-argument lambdas are just nested lambdas', () => {
    const a = consume(parser, lex('{a b c: a + b * c}'));
    const b = consume(parser, lex('{a: {b: {c: a + b * c}}}'));

    expect(a).to.deep.equal(b)
  })

  it('an operator can be acquired by placing it inside ( and )', () => {
    expect(consume(parser, lex('(+)')))
      .to.have.property('ok')
      .which.deep.equals(Name('+'))
  })

  it('an operator can be partially applied from the left, like a function', () => {
    expect(consume(parser, lex('(+ 1)')))
      .to.have.property('ok')
      .which.deep.equals(App(Name('+'), Num(1)))
  })

  it('an operator can be partially applied from the right, like a function', () => {
    const a = consume(parser, lex('(2 ^)'));
    const b = consume(parser, lex('{_: 2 ^ _}'));

    expect(a).to.deep.equal(b)
  })

  it('double-quoted string literals produce string values', () => {
    expect(consume(parser, lex(`"Hellon't,\\nworld!"`)))
      .to.have.property('ok')
      .which.deep.equals(Str("Hellon't,\nworld!"))
  })

  it('single-quoted string literals produce string values', () => {
    expect(consume(parser, lex(`'Hello,\\n"world"!'`)))
      .to.have.property('ok')
      .which.deep.equals(Str('Hello,\n"world"!'))
  })

  it('maps are defined in square brackets', () => {
    expect(consume(parser, lex('[a: 1, b: "Hello"]')))
      .to.have.property('ok')
      .which.deep.equals(Table([['a', Num(1)], ['b', Str("Hello")]]))
  })

  it('an optional trailing comma is permitted in a map', () => {
    expect(consume(parser, lex('[a: 1, b: "Hello",]')))
      .to.have.property('ok')
      .which.deep.equals(Table([['a', Num(1)], ['b', Str("Hello")]]))
  })

  it('a conditional expression can be constructed', () => {
    expect(consume(parser, lex('if foo then bar + baz else bonk')))
      .to.have.property('ok')
      .which.deep.equals(
        IfThenElse(Name('foo'), App(App(Name('+'), Name('bar')), Name('baz')), Name('bonk'))
      )
  })
})
