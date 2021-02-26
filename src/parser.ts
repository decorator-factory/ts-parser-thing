import { Either, dispatch, Ok, Err } from './either';
import * as Ei from './either';

export {Either, dispatch as either, Ok, Err, Ei}
export type ParserF<S, A> = (src: S) => Either<string, [A, S]>;


export class Parser<S, A> {
  readonly parse : ParserF<S, A>;

  constructor(parse : ParserF<S, A>) {
    this.parse = parse;
  }

  map<B>(f: (a: A) => B): Parser<S, B> {
    return parser(src => {
      const ea = this.parse(src);
      if ('err' in ea)
        return Err(ea.err);
      const [a, rest] = ea.ok;
      return Ok([f(a), rest]);
    });
  }

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

  then<B>(other: Parser<S, B>): Parser<S, B> {
    return this.flatMap(_ => other);
  }

  neht<B>(other: Parser<S, B>): Parser<S, A> {
    return this.flatMap(a => other.map(_ => a))
  }

  lookAhead(): Parser<S, A>{
    return parser(src => {
      const ea = this.parse(src);
      if ('err' in ea)
        return ea;
      const [a, _rest] = ea.ok;
      return Ok([a, src]);
    });
  }

  apply<B>(pf: Parser<S, (a: A) => B>): Parser<S, B> {
    return parser(src => {
      const ef = pf.parse(src);
      if ('err' in ef)
        return Err(ef.err);
      const [f, rest] = ef.ok;
      const ea = this.parse(rest);
      return Ei.map(ea, ([a, s]) => [f(a), s]);
    });
  }

  or<B>(other: Parser<S, A>): Parser<S, A> {
    // @ts-ignore
    return parser(src => {
      const ea = this.parse(src);
      if ('ok' in ea)
        return ea;
      const eb = other.parse(src);
      return eb
    })
  }

  orLazy<B>(other: () => Parser<S, B>): Parser<S, A | B> {
    // @ts-ignore
    return parser(src => {
      const ea = this.parse(src);
      if ('ok' in ea)
        return ea;
      const eb = other().parse(src);
      return eb
    })
  }
}

export const parser = <S, A>(fn: ParserF<S, A>): Parser<S, A> => new Parser(fn);
