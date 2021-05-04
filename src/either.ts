/**
 * This module defines the Either type. It represents a value that is either
 * an 'Ok' value (successful result) or an 'Error' value (unsuccessful result).
 */

export type Either<E, A> = Readonly<{ok: A}> | Readonly<{err: E}>;

export const Ok = <E, A>(ok: A): Either<E, A> => ({ok});
export const Err = <E, A>(err: E): Either<E, A> => ({err});

export type ParseError = {recoverable: boolean, msg: string};

export type ParserF<A> = (src: string) => Either<ParseError, [A, string]>;


export const dispatch =
  <E, A, B> (
    ea: Either<E, A>,
    onA: (a: A) => B,
    onE: (e: E) => B,
  ): B =>
    'ok' in ea
    ? onA(ea.ok)
    : onE(ea.err);


export const map =
  <E, A, B>(
    ea: Either<E, A>,
    f: (a: A) => B,
  ): Either<E, B> =>
    dispatch(ea, a => Ok(f(a)), e => Err(e));


export const flatten =
  <E, A>(
    ea: Either<E, Either<E, A>>
  ): Either<E, A> =>
    dispatch(ea, a => a, e => Err(e));


export const flatMap =
  <E, A, B>(
    ea: Either<E, A>,
    f: (a: A) => Either<E, B>
  ): Either<E, B> =>
    flatten(map(ea, f));


export const flatMap2 =
  <E, A, B, C>(
    ea: Either<E, A>,
    eb: Either<E, B>,
    f: (a: A, b: B) => Either<E, C>
  ): Either<E, C> =>
    flatMap(ea, a => flatMap(eb, b => f(a, b)));


export const flatMap3 =
  <E, A, B, C, D>(
    ea: Either<E, A>,
    eb: Either<E, B>,
    ec: Either<E, C>,
    f: (a: A, b: B, c: C) => Either<E, D>
  ): Either<E, D> =>
    flatMap(ea, a => flatMap(eb, b => flatMap(ec, c => f(a, b, c))));


export const or =
  <E, A>(
    ifAllFail: E,
    ...funs: (() => Either<E, A>)[]
  ): Either<E, A> => {
    for (const fun of funs) {
      const result = fun();
      if ('ok' in result)
        return result;
    }
    return Err(ifAllFail);
  }
