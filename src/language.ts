import { Parser, Ok, Err, parser } from './parser';
import * as Comb from './combinators';


export type Token<T extends string> = Readonly<{
  type: T;
  position: number;
  content: string;
}>;


export type TokenStream<T extends string> = Token<T>[];


export type TokenParser<T extends string, A> = Parser<TokenStream<T>, A>;


export const EOI = 'Unexpected end of input';


export class Lang<T extends string>{
  oneOf(...allowed: string[]): TokenParser<T, Token<T>> {
    return parser(
      src =>
        src.length === 0
        ? Err(EOI)
        : allowed.some(t => t === src[0].type)
          ? Ok([src[0], src.slice(1)])
          : Err(`Expected ${allowed.join('|')}, got ${src[0].type}`)
    );
  }

  reading<A>(t: string, read: (content: string) => A): TokenParser<T, A> {
    return this.oneOf(t).map(({content}) => read(content));
  }

  many<A>(single: TokenParser<T, A>): TokenParser<T, A[]> {
    return single
      .flatMap(a => this.many(single).map(items => [a, ...items]))
      .or(Comb.always([]));
  }
}
