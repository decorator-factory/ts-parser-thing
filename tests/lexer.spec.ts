import { assert } from 'chai';
import { testPure } from './helpers';
import { lex, Tok } from '../src/lang/lexer';


const tok = (type: Tok, position: number, content: string) =>
  ({type, position, content});


describe('The lexer should split the text into tokens', () => {
  describe('Numbers are tokenized correctly', () => {
    it(
      'interprets a sequence of digits as a number',
      () => assert.deepEqual(lex('12345'), [tok('dec', 0, '12345')])
    );
    it(
      'iterprets a minus sign and a sequence of digits as a number',
      () => assert.deepEqual(lex('-12345'), [tok('dec', 0, '-12345')])
    );
    it(
      "doesn't interpret a plus sign and a sequence of digits as a number",
      () => assert.notDeepEqual(lex('+12345'), [tok('dec', 0, '+12345')])
    );
    it(
      'interprets a sequence of digits, a dot and a sequence of digits as a number',
      () => assert.deepEqual(lex('3.1415'), [tok('dec', 0, '3.1415')])
    );
    it(
      'interprets scientific notation with no decimal part as a number',
      () => assert.deepEqual(lex('420e69'), [tok('dec', 0, '420e69')])
    );
    it(
      'interprets scientific notation with decimal part as a number',
      () => assert.deepEqual(lex('4.20e69'), [tok('dec', 0, '4.20e69')])
    );
  });

  describe('Names are tokenized correctly', () => {
    it(
      'allows latin letters, digits, underscores, `?` and `!`',
      () => assert.deepEqual(lex('fooBaR_a1235?!!'), [tok('name', 0, 'fooBaR_a1235?!!')])
    );
    it(
      "doesn't allow digits in the beginning of the name",
      () => assert.notDeepEqual(lex('2pac'), [tok('name', 0, '2pac')])
    );
    it(
      "doesn't allow ? or ! in the beginning",
      () => {
        assert.notDeepEqual(lex('?what?'), [tok('name', 0, '?what?')]);
        assert.notDeepEqual(lex('!yes!'), [tok('name', 0, '!yes!')])
      }
    );
  });

  describe('Strings are tokenized correctly', () => {
    it(
      'allows single-quoted strings',
      () => assert.deepEqual(lex(`'hello, world'`), [tok('string1', 0, `'hello, world'`)])
    );
    it(
      'allows double-quoted strings',
      () => assert.deepEqual(lex(`"hello, world"`), [tok('string2', 0, `"hello, world"`)])
    );
    it(
      'allows escaping in a single-quoted string',
      () => assert.deepEqual(lex(`'it\\'s me'`), [tok('string1', 0, `'it\\'s me'`)])
    );
    it(
      'allows escaping in a double-quoted string',
      () => assert.deepEqual(lex(`"it's \\"me\\""`), [tok('string2', 0, `"it's \\"me\\""`)])
    );
  });

  describe('With `includeWs` set to true,', () => {
    it(
      'includes whitespace tokens',
      () => assert.deepEqual(
        lex('foo bar baz', {includeWs: true}),
        [
          tok('name', 0, 'foo'),
          tok('ws', 3, ' '),
          tok('name', 4, 'bar'),
          tok('ws', 7, ' '),
          tok('name', 8, 'baz'),
        ]
      )
    )
  });
})