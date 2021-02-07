import { Parser, Ok, Err, parser } from './parser';
import * as Comb from './combinators';

type TokenType =
  | 'name'
  | 'lpar'
  | 'rpar'
  | 'lbrace'
  | 'rbrace'
  | 'operator'
  | 'infixName'

type ExtraTokenType =
  | 'whitespace'
  | 'comment'

export type Token<T extends string> = Readonly<{
  type: T;
  position: number;
  content: string;
}>;

export type TokenStream<T extends string> = Token<T>[];

export type TokenParser<T extends string, A> = Parser<TokenStream<T>, A>;

///

export const EOI = 'Unexpected end of input';


export const oneOf =
  <T extends string>(
    ...allowed: string[]
  ): TokenParser<T, Token<T>> =>
    parser(
      src =>
        src.length === 0
        ? Err(EOI)
        : allowed.some(t => t === src[0].type)
          ? Ok([src[0], src.slice(1)])
          : Err(`Expected ${allowed.join('|')}, got ${src[0].type}`)
    );

export const manyLazy =
  <T extends string, A>(
    single: TokenParser<T, A>
  ): TokenParser<T, A[]> =>
    single
      .flatMap(a => manyLazy(single).map(items => [a, ...items]))
      .or(Comb.always([]));

export const reading =
  <T extends string, A>(
    t: string,
    read: (content: string) => A
  ): TokenParser<T, A> =>
    oneOf<T>(t).map(({content}) => read(content))
