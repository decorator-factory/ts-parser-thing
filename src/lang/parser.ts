import { Lang, TokenParser } from '../language'
import * as Comb from '../combinators'
import { Tok } from './lexer'
import {
  Op, Ops, Expr, ParseOptions, App,
  Name, Str, Table, Symbol, Cond,
  ArgSingle, LamArg, ArgTable, Lambda,
  Dec, makeLambda, InfixOp, ExprOp
} from './ast'
import { shuntingYard } from './shunting-yard'
import { ColorHandle, identityColorHandle } from './color';
import Big from 'big.js';
import { matchExhaustive } from '@practical-fp/union-types'


const L = new Lang<Tok>();
type P<A> = TokenParser<Tok, A>;


const inParentheses = <A>(p: P<A>): P<A> =>
  Comb.surroundedBy(L.oneOf('lp'), p, L.oneOf('rp'))

const trailingComma = (lookAheadFor: Tok) =>
 L.oneOf('comma').or(L.oneOf(lookAheadFor).lookAhead());


type SetOptions = (options: ParseOptions) => void;
export const makeParser = (options: ParseOptions): [P<Expr>, SetOptions] => {
  const nameOrOperator = L.reading('name', n => n).or(L.reading('op', n => n));


  const exprParser: P<Expr> = Comb.lazy(() => exprParser_);


  const name = L.reading('name', Name);


  const decLiteral = L.reading('dec', s => Dec(new Big(s)));


  const stringLiteral =
    L.reading('string1', eval).or(L.reading('string2', eval)).map(Str);


  const symbolLiteral =
    L.oneOf('col')
    .then(
      nameOrOperator.map(Symbol)
      .orBail('Expected name or operator after :')
    );


  const parenthesized = inParentheses(exprParser);


  const tableLiteral = (() => {
    const singleTableEntry =
      Comb.pair(
        nameOrOperator.neht(L.oneOf('col')),
        exprParser
      )
      .orSame(nameOrOperator.map(k => [k, Name(k)]));

    const tableContents =
      Comb.many(singleTableEntry.neht(trailingComma('rbr')))

    return Comb.surroundedBy(
      L.oneOf('lbr'),
      tableContents,
      L.oneOf('rbr'),
    ).map(Table);
  })();


  const lambda = (() => {
    const nameParameter = nameOrOperator.map(ArgSingle);

    const tableParameter = (() => {
      const singleTableEntry = (target: string) =>
        L.oneOf('col').then(parameter).map(
          (p): [string, LamArg] => [target, p]
        )
        .orSame(Comb.always([target, ArgSingle(target)] ));

      const _tablePatHelper: P<[string, LamArg][]> = Comb.surroundedBy(
        L.oneOf('lbr'),
        Comb.many(
          nameOrOperator
          .flatMap(singleTableEntry)
          .neht(trailingComma('rbr'))
        ),
        L.oneOf('rbr'),
      );
      return _tablePatHelper.map(ArgTable);
    })();

    const parameter = nameParameter.or(tableParameter);

    const parameterList = Comb.many(parameter).neht(L.oneOf('dot'));

    // Helper function to turn (x y z. body) into (x. (y. (z. body)))
    const _makeNestedLambda = (argNames: LamArg[], expr: Expr): Expr =>
      argNames.reduceRight((acc, arg) => makeLambda(arg, acc), expr);

    const functionBody =
      (args: LamArg[]) =>
      exprParser
        .map(expr => _makeNestedLambda(args, expr))
        .orBail('After the dot, there should be a function body');

    return parameterList.flatMap(functionBody);
  })();


  const ifThenElse = Comb.pair(
    L.oneOf('if').then(exprParser.orBail('Expected expression after `if`')),
    Comb.pair(
      L.oneOf('then').orBail('Expected `then`').then(exprParser),
      L.oneOf('else').orBail('Expected `else`').then(exprParser)
    )
  ).map(([ifE, [thenE, elseE]]) => Cond({if: ifE, then: thenE, else: elseE}));


  // `atomic` is something that doesn't change the parsing result
  // if you surround it with parentheses
  const atomic: P<Expr> =
    Comb.lazy(() => operatorSection)
    .or(decLiteral)
    .or(stringLiteral)
    .or(name)
    .or(parenthesized)
    .or(ifThenElse)
    .or(symbolLiteral)
    .or(tableLiteral);


  const app = (fun: Expr, arg: Expr) => App({fun, arg});

  const operatorSection = (() => {
    // An operator section can have either an infix operator,
    // like (+ 3), or a backticked name, like (`div` 2)
    const infixOperator =
      L.reading('op', Name)
      .or(
        L.oneOf('backtick')
        .then(L.reading('name', Name))
        .neht(L.oneOf('backtick').orBail('Unclosed `'))
      );

    // (+ 1) <=> {_: _ + 1}
    const leftSection =
      inParentheses(Comb.pair(infixOperator, atomic))
      .map(([op, right]) => makeLambda(ArgSingle('_'), app(app(op, Name('_')), right)));

    // (1 +) <=> ((+) 1)
    const rightSection =
      inParentheses(Comb.pair(atomic, infixOperator))
      .map(([left, op]) => app(op, left));

    // (+)
    const bareOperator = inParentheses(infixOperator);

    return  leftSection.or(rightSection).or(bareOperator);
  })();


  const application =
    Comb.manyAtLeast(atomic, 1, 'Unexpected end of input')
        .map(([first, ...rest]) => rest.reduce(app, first));
        // (a b c d) = (((a b) c) d) = app(app(app(a, b), c), d)
        // where a, b, c, d are atomic expressions


  const infixOperatorExpression = (() => {
    // Infix expression, like (1 + a - b c d * e f g)

    const symbolInfixOp = L.reading<Op>('op', InfixOp);

    const backtickInfixOp =
      L.oneOf('backtick')
      .then(exprParser.map(ExprOp))
      .neht(L.oneOf('backtick'));

    const infixOperator = symbolInfixOp.or(backtickInfixOp);

    const operatorList: P<Ops> = Comb.pair(
      application,
      Comb.many(Comb.pair(infixOperator, application))
    ).map(
      ([initial, chunks]) => ({initial, chunks})
    );

    return operatorList.map(ops => shuntingYard(ops, options));
  })();


  const exprEnd = Comb.maybe(L.oneOf('semicolon'));

  // Entry point
  const exprParser_ = lambda.or(infixOperatorExpression).neht(exprEnd); // tslint:disable-line:variable-name


  return [exprParser_, newOpts => {options = newOpts}];
}


const isIdentifier = (s: string) => /^(?![0-9])[a-zA-Z_0-9]+$/.test(s);


const unparseArg = (arg: LamArg, col: ColorHandle): string =>
  matchExhaustive(arg, {
    ArgSingle: name => col.arg(name),
    ArgTable: pairs =>
      col.arg('{')
      + pairs.map(
          ([target, source]) =>
            source.tag === 'ArgSingle' && source.value === target
            ? col.arg(target)
            : col.arg(target) + ': ' + unparseArg(source, col)
      ).join(', ')
      + col.arg('}')
  });

const unparseApp = ({fun, arg}: {fun: Expr, arg: Expr}, col: ColorHandle): string => {
  const args: Expr[] = [];
  while (fun.tag === 'App'){
    args.push(arg);
    arg = fun.value.arg;
    fun = fun.value.fun;
  }
  args.push(arg);
  args.reverse();
  return '(' + unparse(fun, col) + ' ' + args.map(e => unparse(e, col)).join(' ') + ')';
};


const extractLeftOperatorSection = (lam: Lambda): [string, Expr] | null => {
  // Left operator section, like `(- 5)`, is encoded as a lambda: {_: _ - 5}
  // If the function is a left operator section, return the operator and the
  // associated expression.

  if (
    lam.arg.tag === 'ArgSingle'
    && lam.arg.value === '_'
    && lam.expr.tag === 'App'
    && lam.expr.value.fun.tag === 'App'
    && lam.expr.value.fun.value.fun.tag === 'Name'
    && !isIdentifier(lam.expr.value.fun.value.fun.value)
    && lam.expr.value.fun.value.arg.tag === 'Name'
    && lam.expr.value.fun.value.arg.value === '_'
  )
    return [lam.expr.value.fun.value.fun.value, lam.expr.value.arg];
  else
    return null;
};

const unparseLam = (lam: Lambda, col: ColorHandle): string => {
  const leftSection = extractLeftOperatorSection(lam);
  if (leftSection !== null) {
    const [operator, expr] = leftSection;
    return '(' + col.name(operator) + ' ' + unparse(expr, col) + ')';
  }

  const args: LamArg[] = [];
  while (lam.expr.tag === 'Lam') {
    args.push(lam.arg);
    lam = lam.expr.value;
  }
  args.push(lam.arg);
  return (
    col.punctuation('(')
    + args.map(e => unparseArg(e, col)).join(' ')
    + '. '
    + unparse(lam.expr, col)
    + col.punctuation(')')
  );
}

export const unparse = (expr: Expr, col: ColorHandle = identityColorHandle, depth: number = 0): string => {
  if (depth > 12)
    return '...';

  return matchExhaustive(expr, {
    Name: name => col.name(isIdentifier(name) ? name : `(${name})`),
    Dec: value => col.num(value.toString()),
    Str: value => col.str(JSON.stringify(value)),
    Symbol: value => col.constant(':' + value),
    Table: pairs =>
      col.punctuation('{')
      + pairs.map(([k, v]) => `${col.name(k)}: ${unparse(v, col, depth+1)}`).join(', ')
      + col.punctuation('}'),
    App: app => unparseApp(app, col),
    Lam: lam => unparseLam(lam, col),
    Cond: cond => [
      col.keyword('if'),
      unparse(cond.if, col, depth+1),
      col.keyword('then'),
      unparse(cond.then, col, depth+1),
      col.keyword('else'),
      unparse(cond.else, col, depth+1)
    ].join(' '),
  });
};
