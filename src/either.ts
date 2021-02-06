export type Either<E, A> = {ok: A} | {err: E};

export const Ok = <E, A>(ok: A): Either<E, A> => ({ok});
export const Err = <E, A>(err: E): Either<E, A> => ({err});

export type ParserF<A> = (src: string) => Either<string, [A, string]>;


export const either =
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
    either(ea, a => Ok(f(a)), e => Err(e));


export const flatten =
  <E, A>(
    ea: Either<E, Either<E, A>>
  ): Either<E, A> =>
    either(ea, a => a, e => Err(e));


export const flatMap =
  <E, A, B>(
    ea: Either<E, A>,
    f: (a: A) => Either<E, B>
  ): Either<E, B> =>
    flatten(map(ea, f));
