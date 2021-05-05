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
