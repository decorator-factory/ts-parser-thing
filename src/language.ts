import { Parser, Either, Ok, Err, parser } from './parser';
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
}


export const consume =
  <T extends string, A>(
    parser: TokenParser<T, A>,
    source: TokenStream<T>
  ): Either<string, A> => {
    const ea = parser.parse(source);
    if ('err' in ea)
      return Err(ea.err);
    const [a, rest] = ea.ok;
    if (rest.length !== 0)
      return Err(`Syntax error at position ${rest[0].position}, starting with ${rest[0].content}`);
    return Ok(a);
  }
