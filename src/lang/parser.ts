import { Lang, TokenParser } from '../language'
import * as Comb from '../combinators'
import { Tok } from './lexer'
import { Op, Ops, Expr, ParseOptions } from './ast'
import { shuntingYard } from './shunting-yard'
import { lex } from './lexer'


const L = new Lang<Tok>();
type P<A> = TokenParser<Tok, A>;


const makeParser = (options: ParseOptions): P<Expr> => {
  // forward reference
  const exprParser = Comb.lazy(() => exprParser_);

  const nameParser: P<Expr> =
    L.reading('name', name => ({tag: 'name', name}));

  const numParser: P<Expr> =
    L.reading('num', s => ({tag: 'num', value: parseInt(s)}));

  const paren: P<Expr> = Comb.surroundedBy(
    L.oneOf('lp'),
    exprParser,
    L.oneOf('rp'),
  )

  const atomic: P<Expr> = numParser.or(nameParser).or(paren);

  const appParser: P<Expr> =
    Comb.many(atomic)
      .map(exprs =>
          exprs.slice(1).reduce(
            // a b c d -> (((a b) c) d)
            (fun, arg) => ({tag: 'app', fun, arg}),

            // a -> a
            exprs[0]
          ),
      )

  const opParser: P<Op> =
    L.reading<Op>(
      'op',
      value => ({type: 'symbol', value})
    )
    .or(L.reading<Op>(
      'infixName',
      name => ({type: 'name', value: name.slice(1, -1)})
    ));

  const opStackParser: P<Ops> = Comb.pair(
    appParser,
    Comb.many(Comb.pair(opParser, appParser))
  ).map(
    ([initial, chunks]) => ({initial, chunks})
  )

  const opExpr: P<Expr> =
    opStackParser.map(ops => shuntingYard(ops, options));

  const exprParser_ = opExpr;

  return exprParser_;
}


const isIdentifier = (s: string) => /^(?![0-9])[a-zA-Z_0-9]+$/.test(s);


export const unparse = (expr: Expr): string => {
  switch (expr.tag) {
    case 'name': return isIdentifier(expr.name) ? expr.name : `(${expr.name})`;
    case 'num': return `${expr.value}`;
    case 'app': return `(${unparse(expr.fun)} ${unparse(expr.arg)})`
  }
};
