import { Lang, TokenParser } from '../language'
import * as Comb from '../combinators'
import { Tok } from './lexer'
import { Op, Ops, Expr, ParseOptions, Lam, App, Name, Num, Str, Table, Symbol, IfThenElse, ArgSingle, LamArg, ArgTable, LamT } from './ast'
import { shuntingYard } from './shunting-yard'
import { lex } from './lexer'


const L = new Lang<Tok>();
type P<A> = TokenParser<Tok, A>;


const inParen = <A>(p: P<A>): P<A> =>
  Comb.surroundedBy(L.oneOf('lp'), p, L.oneOf('rp'))

const trailingComma = (lookAheadFor: Tok) =>
 L.oneOf('comma').or(L.oneOf(lookAheadFor).lookAhead());

export const makeParser = (options: ParseOptions): P<Expr> => {
  // forward referencing, because further parser need this
  const exprParser: P<Expr> = Comb.lazy(() => exprParser_);

  // Name
  const name = L.reading('name', Name);

  // Number
  const num = L.reading('num', s => Num(parseInt(s)));

  // String
  const str = L.reading('string1', eval).or(L.reading('string2', eval)).map(Str);

  // Symbol
  const symbol = L.oneOf('tilde').then(L.reading('name', Symbol));

  // Parenthesized expression
  const paren = inParen(exprParser);

  // Table
  const _tableRecord =
    Comb.pair(
      L.reading('name', n => n).neht(L.oneOf('col')),
      exprParser
    );

  const _tableInnards =
    Comb.many(_tableRecord.neht(trailingComma('rsq')))

  const table = Comb.surroundedBy(
    L.oneOf('lsq'),
    _tableInnards,
    L.oneOf('rsq'),
  ).map(Table);

  // Argument pattern for lambda
  const _namePat = L.reading('name', ArgSingle);

  const _tableValue = (target: string) =>
    L.oneOf('col').then(_lamArg).map(
      (p): [string, LamArg] => [target, p]
    )
    .or(Comb.always([target, ArgSingle(target)]));

  const _tablePatHelper: P<[string, LamArg][]> = Comb.surroundedBy(
    L.oneOf('lsq'),
    Comb.many(
      L.reading('name', n => n)
      .flatMap(_tableValue)
      .neht(trailingComma('rsq'))
    ),
    L.oneOf('rsq'),
  )

  const _tablePat = _tablePatHelper.map(ArgTable);

  const _lamArg = _namePat.or(_tablePat);

  // Lambda
  const _makeLambda = (argNames: LamArg[], expr: Expr): Expr =>
    argNames.reduceRight((acc, arg) => Lam(arg, acc), expr);

  const _lamArgs = Comb.many(_lamArg);

  const _lamBody =
    (args: LamArg[]) =>
    L.oneOf('col').then(exprParser.map(expr => _makeLambda(args, expr)));

  const lambda =
    Comb.surroundedBy(
      L.oneOf('lbr'),
      _lamArgs.flatMap(_lamBody),
      L.oneOf('rbr')
    )

  // Conditional
  const ite = Comb.pair(
    L.oneOf('if').then(exprParser),
    Comb.pair(
      L.oneOf('then').then(exprParser),
      L.oneOf('else').then(exprParser)
    )
  ).map(([ifE, [thenE, elseE]]) => IfThenElse(ifE, thenE, elseE));


  // `atomic` is something that doesn't change the parsing result
  // if you surround it with parentheses
  const atomic: P<Expr> =
    Comb.lazy(() => opSection)
    .or(num)
    .or(str)
    .or(name)
    .or(paren)
    .or(ite)
    .or(lambda)
    .or(symbol)
    .or(table);

  // Operator section
  const _leftSection =
    inParen(Comb.pair(
      L.reading('op', Name),
      Comb.many(atomic)
    )).map(([first, rest]) => rest.reduce(App, first));

  const _rightSection =
    inParen(Comb.pair(
      atomic,
      L.reading('op', Name)
    )).map(([left, op]) => Lam(ArgSingle('_'), App(App(op, left), Name('_'))));

  const opSection = _leftSection.or(_rightSection);

  const application =
    Comb.manyAtLeast(atomic, 1, 'Malformed or ambiguous function application')
        .map(([first, ...rest]) => rest.reduce(App, first));

  // Infix operator parser
  const _symbolInfixOp =
    L.reading<Op>('op',
      value => ({type: 'infix', value})
    );

  const _nameInfixOp =
    L.reading<Op>('infixName',
      name => ({type: 'name', value: name.slice(1, -1)})
    );

  const _infixOperator = _symbolInfixOp.or(_nameInfixOp);

  // Infix operator application using the Shunting yard algorithm:
  const _operatorList: P<Ops> = Comb.pair(
    application,
    Comb.many(Comb.pair(_infixOperator, application))
  ).map(
    ([initial, chunks]) => ({initial, chunks})
  )

  const opExpr = _operatorList.map(ops => shuntingYard(ops, options));

  // Entry point
  const exprParser_ = opExpr;

  return exprParser_;
}


const isIdentifier = (s: string) => /^(?![0-9])[a-zA-Z_0-9]+$/.test(s);


const unparseArg = (arg: LamArg): string =>
  'single' in arg
  ? arg.single
  : '[' + arg.table.map(
    ([target, source]) =>
      'single' in source && source.single === target
      ? target
      : target + ': ' + unparseArg(source)
  ).join(', ') + ']';

const unparseApp = ({fun, arg} : {fun: Expr, arg: Expr}): string => {
  const args: Expr[] = [];
  while (fun.tag === 'app'){
    args.push(arg);
    arg = fun.arg;
    fun = fun.fun;
  }
  args.push(arg);
  args.reverse();
  return '(' + unparse(fun) + ' ' + args.map(unparse).join(' ') + ')';
};

const unparseLam = (lam: LamT): string => {
  const args: LamArg[] = [];
  while (lam.expr.tag === 'lam') {
    args.push(lam.arg);
    lam = lam.expr;
  }
  args.push(lam.arg);
  return '{' + args.map(unparseArg).join(' ') + ': ' + unparse(lam.expr) + '}';
}

export const unparse = (expr: Expr): string => {
  switch (expr.tag) {
    case 'name': return isIdentifier(expr.name) ? expr.name : `(${expr.name})`;
    case 'num': return `${expr.value}`;
    case 'str': return JSON.stringify(expr.value);
    case 'symbol': return '~' + expr.value;
    case 'table': return '[' + expr.pairs.map(([k, v]) => `${k}: ${unparse(v)}`).join(', ') + ']'
    case 'app': return unparseApp(expr);
    case 'lam': return unparseLam(expr);
    case 'ite': return `if ${expr.if} then ${expr.then} else ${expr.else}`;
  }
};
