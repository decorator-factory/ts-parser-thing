/**
 * Tests for individual language features.
 */

import * as rt from '../../src/lang/runtime';
import * as ast from '../../src/lang/ast';
import { assert } from 'chai';

import { pureIOHandle, testPure } from '../_helpers';
import Big from 'big.js';
import { Map } from 'immutable';
import { Interpreter } from '../../src/lang/interpreter';
import Fraction from 'fraction.js';

describe('Language features', () => {
  describe('Unit', () => {
    testPure('can be created with decimal literals', '3.14', { ok: rt.Unit(Big('3.14')) });
    testPure("are using decimal arithmetic, i.e. aren't floats", '0.1 + 0.2', '0.3');
    describe('Have dimensions', () => {
      testPure(
        'can be assigned a dimension using a converter function',
        'meters 3',
        { ok: rt.Unit(3, {L: new Fraction(1)})}
      );
      describe('Units with the same dimension', () => {
        testPure('can be added', 'meters 1 + meters 2', 'meters 3');
        testPure('can be subtracted', 'meters 6 - meters 4', 'meters 2');
        testPure('can be multiplied', 'meters 2 * meters 3', { ok: rt.Unit(6, {L: new Fraction(2)})});
        testPure('can be divided', 'meters 9 / meters 3', '3');
      });
      describe('Units with different dimensions', () => {
        testPure('cannot be added', 'meters 1 + seconds 2', { error: 'runtimeError' });
        testPure('cannot be subtracted', 'meters 6 - seconds 4', { error: 'runtimeError' });
        testPure(
          'can be multiplied',
          'meters 2 * seconds 3',
          { ok: rt.Unit(6, {L: new Fraction(1), T: new Fraction(1)})}
        );
        testPure(
          'can be divided',
          'meters 9 / seconds 3',
          { ok: rt.Unit(3, {L: new Fraction(1), T: new Fraction(-1)})}
        );
      });
    })
  });

  describe('Strings', () => {
    testPure('can be created with string literals', '"foo"', { ok: rt.Str('foo') });
  });

  describe('Symbols', () => {
    testPure('can be created from string literals', ':sym', { ok: rt.Symbol('sym') });
    testPure('can contain an identifier', ':hello?!', { ok: rt.Symbol('hello?!') });
    testPure('can contain an operator', ':>>=', { ok: rt.Symbol('>>=') });
  });

  describe('Tables', () => {
    testPure(
      'can be created from table literals',
      '{x: 1, y: 2}',
      { ok: rt.Table(Map([['x', rt.Unit(1)], ['y', rt.Unit(2)]])) }
    );
    testPure(
      'can have operators as keys',
      '{+: 1, >>=: 2}',
      { ok: rt.Table(Map([['+', rt.Unit(1)], ['>>=', rt.Unit(2)]])) }
    );
  });

  describe('Function', () => {
    // apparently, `Map`s don't play nice with deep equality,
    // and we'd have to somehow get the global namespace

    it('can be created from function literals', () => {
      const actual = new Interpreter(pureIOHandle).runLine('x. x');
      const identity = { arg: ast.ArgSingle('x'), expr: ast.Name('x'), capturedNames: [] };
      assert.deepNestedPropertyVal(actual, 'ok.tag', 'Fun');
      assert.deepNestedPropertyVal(actual, 'ok.value.fun', identity);
    });

    describe('Allow capturing values from the outside', () => {
      it('within simple name lookup', () => {
        const actual = new Interpreter(pureIOHandle).runLine('x. y');
        assert.deepNestedPropertyVal(actual, 'ok.tag', 'Fun');
        assert.deepNestedPropertyVal(actual, 'ok.value.fun.capturedNames', ['y']);
      });

      it('within function application', () => {
        const actual = new Interpreter(pureIOHandle).runLine('x. f x');
        assert.deepNestedPropertyVal(actual, 'ok.tag', 'Fun');
        assert.deepNestedPropertyVal(actual, 'ok.value.fun.capturedNames', ['f']);
      });

      it('within table literals', () => {
        const actual = new Interpreter(pureIOHandle).runLine('x. {foo: bar}');
        assert.deepNestedPropertyVal(actual, 'ok.tag', 'Fun');
        assert.deepNestedPropertyVal(actual, 'ok.value.fun.capturedNames', ['bar']);
      });

      it('within conditionals', () => {
        const actual = new Interpreter(pureIOHandle).runLine('{}. if a then b else c');
        assert.deepNestedPropertyVal(actual, 'ok.tag', 'Fun');
        assert.deepNestedPropertyVal(actual, 'ok.value.fun.capturedNames', ['a', 'b', 'c']);
      });

      it('with no external names, no names are captured', () => {
        const actual = new Interpreter(pureIOHandle).runLine('x. {foo: if x then x else x, bar: :baz, baz: "boom"}');
        assert.deepNestedPropertyVal(actual, 'ok.tag', 'Fun');
        assert.deepNestedPropertyVal(actual, 'ok.value.fun.capturedNames', []);

      });
    })

    it('can have multiple parameters to create curried functions', () => {
      const actual = new Interpreter(pureIOHandle).runLine('x y. x');
      const curried = {
        arg: ast.ArgSingle('x'),
        expr: ast.Lam({ arg: ast.ArgSingle('y'), expr: ast.Name('x'), capturedNames: ['x'] }),
        capturedNames: []
      };
      assert.deepNestedPropertyVal(actual, 'ok.tag', 'Fun');
      assert.deepNestedPropertyVal(actual, 'ok.value.fun', curried);
    });

    describe('Can have table parameters', () => {
      it('with syntax similar to table literals, also allowing shorthands', () => {
        const actual = new Interpreter(pureIOHandle).runLine('{x: y, z}. y');
        const expected = {
          arg: ast.ArgTable([['x', ast.ArgSingle('y')], ['z', ast.ArgSingle('z')]]),
          expr: ast.Name('y'),
          capturedNames: []
        };
        assert.deepNestedPropertyVal(actual, 'ok.tag', 'Fun');
        assert.deepNestedPropertyVal(actual, 'ok.value.fun', expected);
      });

      testPure(
        'allows conveniently destructuring a table argument',
        '({x, y}. x) {x: 3, y: 5}',
        '3'
      );

      testPure(
        'to extract a value it calls the argument with a symbol, allowing duck typing',
        '({foo: bar}. bar) (x. x)',
        ':foo'
      );
    })

  });
});

//

// testPure('can be used to index tables', '{foo: 42} :foo', '42');