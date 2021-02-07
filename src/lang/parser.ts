import { Lang, TokenParser } from '../language'
import * as Comb from '../combinators'
import { Tok } from './lexer'
import { Op, Ops, Expr, ParseOptions, Lam, App, Name } from './ast'
import { shuntingYard } from './shunting-yard'
import { lex } from './lexer'


const L = new Lang<Tok>();
type P<A> = TokenParser<Tok, A>;


const inParen = <A>(p: P<A>): P<A> =>
  Comb.surroundedBy(L.oneOf('lp'), p, L.oneOf('rp'))


export const makeParser = (options: ParseOptions): P<Expr> => {
  // forward referencing, because further parser need this
  const exprParser: P<Expr> = Comb.lazy(() => exprParser_);

  const nameParser = L.reading('name', Name);

  const numParser: P<Expr> =
    L.reading('num', s => ({tag: 'num', value: parseInt(s)}));

  const paren = inParen(exprParser);

  // Lambda parser
  const _makeLambda = (argNames: string[], expr: Expr): Expr =>
    argNames.reduceRight((acc, argName) => Lam(argName, acc), expr);

  const _lamArgs = Comb.many(L.reading('name', n => n));

  const _lamBody =
    (args: string[]) =>
    L.oneOf('col').then(exprParser.map(expr => _makeLambda(args, expr)));

  const lamParser =
    Comb.surroundedBy(
      L.oneOf('lbr'),
      _lamArgs.flatMap(_lamBody),
      L.oneOf('rbr')
    )

  // `atomic` is something that doesn't change the parsing result
  // if you surround it with parentheses
  const atomic = numParser.or(nameParser).or(paren).or(lamParser);

  const _opSection =
    inParen(Comb.pair(
      L.reading('op', Name),
      Comb.many(atomic)
    )).map(([first, rest]) => rest.reduce(App, first));

  const application =
    Comb.manyAtLeast(atomic, 1, 'Malformed or ambiguous function application')
        .map(([first, ...rest]) => rest.reduce(App, first));

  // Infix operator parser
  const _symbolInfixOp =
    L.reading<Op>('op',
      value => ({type: 'symbol', value})
    );

  const _nameInfixOp =
    L.reading<Op>('infixName',
      name => ({type: 'name', value: name.slice(1, -1)})
    );

  const _infixOperator = _symbolInfixOp.or(_nameInfixOp);

  const _operatorList: P<Ops> = Comb.pair(
    application,
    Comb.many(Comb.pair(_infixOperator, application))
  ).map(
    ([initial, chunks]) => ({initial, chunks})
  )

  const opExpr = _operatorList.map(ops => shuntingYard(ops, options));

  // Entry point
  const exprParser_ = _opSection.or(opExpr);

  return exprParser_;
}


const isIdentifier = (s: string) => /^(?![0-9])[a-zA-Z_0-9]+$/.test(s);


export const unparse = (expr: Expr): string => {
  switch (expr.tag) {
    case 'name': return isIdentifier(expr.name) ? expr.name : `(${expr.name})`;
    case 'num': return `${expr.value}`;
    case 'app': return `(${unparse(expr.fun)} ${unparse(expr.arg)})`;
    case 'lam': return `{${expr.argName}: ${unparse(expr.expr)}}`;
  }
};
