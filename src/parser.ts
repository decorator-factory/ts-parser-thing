import { Either, Ok, Err, ParseError } from './either';
import * as Ei from './either';

export {Either, Ok, Err, Ei}
export type ParserF<S, A> = (src: S) => Either<ParseError, readonly [A, S]>;


export class Parser<S, A> {
  readonly parse : ParserF<S, A>;

  constructor(parse : ParserF<S, A>) {
    this.parse = parse;
  }

  /**
   * Keep the parsing the same, but apply a transformation to the result
   */
  map<B>(f: (a: A) => B): Parser<S, B> {
    return parser(src => {
      const ea = this.parse(src);
      if ('err' in ea)
        return Err(ea.err);
      const [a, rest] = ea.ok;
      return Ok([f(a), rest]);
    });
  }

  /**
   * Similarly to Array.prototype.flatMap or Promise.prototype.then,
   * allows you to combine actions of the shape (A => Parser<S, B>)
   */
  flatMap<B>(f: (a: A) => Parser<S, B>): Parser<S, B> {
    return parser(src => {
      const ea = this.parse(src);
      if ('err' in ea)
        return Err(ea.err);
      const [a, rest] = ea.ok;
      const pb = f(a);
      return pb.parse(rest);
    });
  }

  /**
   * Discard the result of the current parser and run the next one
   */
  then<B>(other: Parser<S, B>): Parser<S, B> {
    return this.flatMap(_ => other);
  }

  /**
   * Run the next input, but keep the result of the initial one
   */
  neht<B>(other: Parser<S, B>): Parser<S, A> {
    return this.flatMap(a => other.map(_ => a))
  }

  /**
   * If this parser fails to match, produce an unrecoverable error
   */
  orBail(msg: string): Parser<S, A> {
    return this.or( parser(_ => ({err: {recoverable: false, msg}})) );
  }

  /**
   * Transform the parser in such a way that it doesn't consume
   * the input, but still checks that it could've.
   */
  lookAhead(): Parser<S, A>{
    return parser(src => {
      const ea = this.parse(src);
      if ('err' in ea)
        return ea;
      const [a, _rest] = ea.ok;
      return Ok([a, src]);
    });
  }

  /**
   * If this parser fails, attempt to use another one
   * (at the same starting point, without the input
   * consumed)
   */
  or<B>(other: Parser<S, B>): Parser<S, A | B> {
    // @ts-ignore
    return parser(src => {
      const ea = this.parse(src);
      if ('ok' in ea)
        return ea;
      if (!ea.err.recoverable)
        return ea;
      const eb = other.parse(src);
      return eb
    })
  }

  /**
   * Same as `or`, but expects the same type, which changes
   * how some type inference works.
   */
  orSame(other: Parser<S, A>): Parser<S, A> {
    return this.or(other);
  }
}

export const parser = <S, A>(fn: ParserF<S, A>): Parser<S, A> => new Parser(fn);
