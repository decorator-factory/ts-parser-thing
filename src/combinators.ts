import { Parser, Ok, Err, parser } from './parser';


export const surroundedBy =
  <S, L, M, R> (
    left: Parser<S, L>,
    middle: Parser<S, M>,
    right: Parser<S, R>,
  ): Parser<S, M> =>
    left.then(middle).neht(right);

export const always =
  <S, A>(
    a: A
  ): Parser<S, A> =>
    parser(s => Ok([a, s]));

export const fail =
  <S, A>(
    message: string
  ): Parser<S, A> =>
    parser(_ => Err(message));

export const concat =
  <S, AS extends any[], A>(
    prev: Parser<S, AS>,
    next: Parser<S, A>,
  ): Parser<S, [...AS, A]> =>
    prev.flatMap(a_s => next.map(a => [...a_s, a]));

export const pair =
    <S, A, B>(
      left: Parser<S, A>,
      right: Parser<S, B>,
    ): Parser<S, [A, B]> =>
      left.flatMap(a => right.map(b => [a, b]));

export const concats =
    <S, AS extends any[]>(
      ...rest: { [I in keyof AS]: Parser<S, AS[I]> }
    ): Parser<S, AS> =>
      rest.reduce(
        (acc, next) => acc.flatMap(a_s => next.map(a => [...a_s, a])),
        always([])
      );

export const lazy =
  <S, A>(
    get: () => Parser<S, A>
  ): Parser<S, A> =>
    parser(src => get().parse(src));
