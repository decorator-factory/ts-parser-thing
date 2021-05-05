import * as readline from 'readline';
import { Interpreter, LangError } from './lang/interpreter';
import { prettyPrint, RuntimeError, Value } from './lang/runtime';
import { ColorHandle, identityColorHandle } from './lang/color';
import chalk from 'chalk';
import { Either, Err, Ok } from './either';

import { renderDim } from './lang/units';
import { matchExhaustive } from '@practical-fp/union-types';


/**
 * Given an interpreter and source code, try to run the code in the
 * interpreter. In case of error, format the error as a string.
 * Otherwise, return an array of values, where each value is the result
 * of evaluating an expression from the source code.
 *
 * e.g. running the code `1; 2; 3` will return Ok([Unit(1), Unit(2), Unit(3)])
 */
export const runCode = (() => {
  const formatErrorType = (k: RuntimeError['tag']): string => ({
    'MissingKey': 'missing key',
    'UnexpectedType': 'unexpected type',
    'UndefinedName': 'name not defined',
    'DimensionMismatch': 'dimension mismatch',
    'NotInDomain': 'value not in domain',
  }[k]);

  const printErrorDetails = (e: RuntimeError): string =>
    matchExhaustive(e, {
      MissingKey: key => key,
      UndefinedName: name => name,
      UnexpectedType: ({expected, got}) => `expected ${expected}, got ${prettyPrint(got, colors)}`,
      DimensionMismatch: ({left, right}) => `between ${renderDim(left)} and ${renderDim(right)}`,
      NotInDomain: ({value, explanation}) => `${value}, ${explanation}`
    });

  const printError = (e: LangError): string => {
    switch (e.type) {
      case 'lexError':
        return chalk.red('Lex error: ') + chalk.yellowBright(e.msg);
      case 'parseError':
        return chalk.red('Parse error: ') + chalk.yellowBright(e.msg);
      case 'runtimeError':
        return (
            chalk.red('Runtime error: ')
          + chalk.yellowBright(
            formatErrorType(e.err.tag) + ': ' + printErrorDetails(e.err)
          )
        );
    }
  };

  return (interpreter: Interpreter, sourceCode: string): Either<string, Value[]> => {
    const result = interpreter.runMultiline(sourceCode);
    return 'ok' in result
      ? Ok(result.ok)
      : Err(printError(result.err));
  };
})();


/**
 * Color handle chosen depending on the terminal capabilities
 */
const colors = (() => {
  const colorsRgb: ColorHandle = {
    ...identityColorHandle,
    str: chalk.rgb(232, 221, 100),
    num: chalk.rgb(182, 106, 217),
    constant: chalk.bold.rgb(158, 59, 204),
    name: chalk.rgb(210, 247, 231),
    keyword: chalk.bold.rgb(252, 38, 109),

    punctuation: chalk.rgb(252, 197, 215),

    arg: chalk.underline.rgb(158, 252, 86),
  };


  const colorsSimple: ColorHandle = {
    ...identityColorHandle,
    str: chalk.yellowBright,
    num: chalk.magentaBright,
    constant: chalk.magenta,
    name: chalk.whiteBright,
    keyword: chalk.red,

    arg: chalk.greenBright,
  };

  // Some terminals don't support full color, so
  // we have to provide a fallback
  return chalk.level <= 2 ? colorsSimple : colorsRgb;
})();


export const readEvalPrintLoop = () => {
  const formatPrompt = () => chalk.greenBright('λ > ');

  const interpreter = new Interpreter();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Gracefully handle CTRL+C
  rl.on('SIGINT', () => {
    rl.question('Exit [y/n]? ', answer => {
      if (['y', 'Y', 'yes'].includes(answer))
        process.exit();
      else
        prompt();
    })
  });

  const prompt = () => {
    process.stdout.write(formatPrompt(), 'utf-8');
  };

  rl.setPrompt(formatPrompt());
  prompt();
  rl.on('line', input => {
    if (input.trim() !== '') {
      const result = runCode(interpreter, input);
      if ('err' in result)
        console.log(result.err);
      else
        for (const v of result.ok)
          console.log(prettyPrint(v, colors));
    }
    prompt();
  });
};