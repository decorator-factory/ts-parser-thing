import { Lang, TokenParser } from '../language'
import * as Comb from '../combinators'
import { Tok } from './lexer'
import { Op, Ops, Expr, ParseOptions, Lam, App, Name, Num, Str, Table, Symbol, IfThenElse, ArgSingle, LamArg, ArgTable, LamT } from './ast'
import { shuntingYard } from './shunting-yard'
import { lex } from './lexer'
import { ColorHandle, identityColorHandle } from './color';


const L = new Lang<Tok>();
type P<A> = TokenParser<Tok, A>;


const inParen = <A>(p: P<A>): P<A> =>
  Comb.surroundedBy(L.oneOf('lp'), p, L.oneOf('rp'))

const trailingComma = (lookAheadFor: Tok) =>
 L.oneOf('comma').or(L.oneOf(lookAheadFor).lookAhead());


type SetOptions = (options: ParseOptions) => void;
export const makeParser = (options: ParseOptions): [P<Expr>, SetOptions] => {
  // forward referencing, because further parser need this
  const exprParser: P<Expr> = Comb.lazy(() => exprParser_);

  // Name
  const name = L.reading('name', Name);

  // Number
  const num = L.reading('num', s => Num(parseInt(s)));

  // String
  const str = L.reading('string1', eval).or(L.reading('string2', eval)).map(Str);

  // Symbol
  const symbol =
    L.oneOf('dot').then(
      L.reading('name', Symbol)
      .or(L.reading('op', Symbol))
    );

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
  const _op =
    L.reading('op', Name)
    .or(L.oneOf('backtick').then(L.reading('name', Name)).neht(L.oneOf('backtick')));

  const _leftSection = // (+ 1)
    inParen(Comb.pair(_op, atomic))
    .map(([op, right]) => Lam(ArgSingle('_'), App(App(op, Name('_')), right)));
  // (+ 1) <=> {_: _ + 1}

  const _rightSection =
    inParen(Comb.pair(atomic, _op))
    .map(([left, op]) => App(op, left));
  // (1 +) <=> ((+) 1)

  const _bareOp = inParen(_op);
  // (+)

  const opSection = _leftSection.or(_rightSection).or(_bareOp);

  const application =
    Comb.manyAtLeast(atomic, 1, 'Malformed or ambiguous function application')
        .map(([first, ...rest]) => rest.reduce(App, first));

  // Infix operator parser
  const _symbolInfixOp =
    L.reading<Op>('op',
      value => ({type: 'infix', value})
    );

  const _backtickInfixExpr =
    L.oneOf('backtick')
    .then(exprParser.map<Op>(expr => ({type: 'expr', expr})))
    .neht(L.oneOf('backtick'));

  const _infixOperator = _symbolInfixOp.or(_backtickInfixExpr);

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

  return [exprParser_, newOpts => {options = newOpts}];
}


const isIdentifier = (s: string) => /^(?![0-9])[a-zA-Z_0-9]+$/.test(s);


const unparseArg = (arg: LamArg, col: ColorHandle): string =>
  'single' in arg
  ? col.arg(arg.single)
  : (
    col.argBracket('[')
    + arg.table.map(
        ([target, source]) =>
          'single' in source && source.single === target
          ? col.arg(target)
          : col.arg(target) + ': ' + unparseArg(source, col)
      ).join(', ')
    + col.argBracket(']')
  );

const unparseApp = ({fun, arg}: {fun: Expr, arg: Expr}, col: ColorHandle): string => {
  const args: Expr[] = [];
  while (fun.tag === 'app'){
    args.push(arg);
    arg = fun.arg;
    fun = fun.fun;
  }
  args.push(arg);
  args.reverse();
  return '(' + unparse(fun, col) + ' ' + args.map(e => unparse(e, col)).join(' ') + ')';
};

const unparseLam = (lam: LamT, col: ColorHandle): string => {
  // right operator section, like `(- 5)`, is encoded as a lambda: {_: _ - 5}
  // TODO: refactor
  if ('single' in lam.arg
      && lam.arg.single === '_'
      && lam.expr.tag === 'app'
      && lam.expr.fun.tag === 'app'
      && lam.expr.fun.fun.tag === 'name'
      && !isIdentifier(lam.expr.fun.fun.name)
      && lam.expr.fun.arg.tag === 'name'
      && lam.expr.fun.arg.name === '_')
        return '(' + col.name(lam.expr.fun.fun.name) + ' ' + unparse(lam.expr.arg, col) + ')';

  const args: LamArg[] = [];
  while (lam.expr.tag === 'lam') {
    args.push(lam.arg);
    lam = lam.expr;
  }
  args.push(lam.arg);
  return (
    col.brace('{')
    + args.map(e => unparseArg(e, col)).join(' ')
    + ': '
    + unparse(lam.expr, col)
    + col.brace('}')
  );
}

export const unparse = (expr: Expr, col: ColorHandle = identityColorHandle, depth: number = 0): string => {
  if (depth > 12)
    return '...';

  switch (expr.tag) {
    case 'name': return col.name(isIdentifier(expr.name) ? expr.name : `(${expr.name})`);
    case 'num': return col.num(`${expr.value}`);
    case 'str': return col.str(JSON.stringify(expr.value));
    case 'symbol': return col.symbol('.' + expr.value);
    case 'table': return (
        col.bracket('[')
        + expr.pairs.map(([k, v]) => `${col.name(k)}: ${unparse(v, col, depth+1)}`).join(', ')
        + col.bracket(']')
      );
    case 'app': return unparseApp(expr, col);
    case 'lam': return unparseLam(expr, col);
    case 'ite': return (
      col.keyword('if')
      + ' '
      + unparse(expr.if, col, depth+1)
      + ' '
      + col.keyword('then')
      + ' '
      + unparse(expr.then, col, depth+1)
      + ' '
      + col.keyword('else')
      + ' '
      + unparse(expr.else, col, depth+1)
    );
  }
};
