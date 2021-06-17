import * as readline from 'readline';
import { Interpreter, IOHandle, LangError } from './lang/interpreter';
import { prettyPrint, RuntimeError, Symbol, Value } from './lang/runtime';
import { ColorHandle, identityColorHandle } from './lang/color';
import chalk from 'chalk';
import { Either, Err, Ok } from './either';

import { renderDim } from './lang/units';
import { matchExhaustive } from '@practical-fp/union-types';


import * as path from 'path';
import * as fs from 'fs';
import * as readlieSync from 'readline-sync';


const moduleCache: Record<string, Value> = {};

const STDLIB_PATH = path.resolve(__dirname, '../../stdlib');

export const defaultIOHandle: IOHandle = {
  readLine: () => readlieSync.prompt({prompt: ''}),
  writeLine: (s: string) => console.log(s),
  exit: () => { process.exit() },
  resolveModule: (location: string, moduleName: string) => {
    if (moduleName in moduleCache)
      return {ok: moduleCache[moduleName]};

    const searchPaths =
      moduleName.startsWith('./') || moduleName.startsWith('../')
      ? [location, process.cwd()]
      : [STDLIB_PATH];

    for (const base of searchPaths) {
      const modulePath = path.resolve(base, moduleName);

      let source: string;
      try {
        source = fs.readFileSync(modulePath, { encoding: 'utf-8' });
      } catch {
        continue;
      }

      const interpreter = new Interpreter(defaultIOHandle, null, null, path.dirname(modulePath));

      // If a module tries to import itself circularly, it will get this instead:
      moduleCache[moduleName] = Symbol('__circular_import__');

      const result = interpreter.runMultilineReturnLast(source);

      if ('ok' in result)
        moduleCache[moduleName] = result.ok;
      else
        delete moduleCache[moduleName];

      return result;
    }

    return null;
  }
}


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
    'Other': 'other',
  }[k]);

  const printErrorDetails = (e: RuntimeError): string =>
    matchExhaustive(e, {
      MissingKey: key => key,
      UndefinedName: name => name,
      UnexpectedType: ({expected, got}) => `expected ${expected}, got ${prettyPrint(got, colors)}`,
      DimensionMismatch: ({left, right}) => `between ${renderDim(left)} and ${renderDim(right)}`,
      NotInDomain: ({value, explanation}) => `${value}, ${explanation}`,
      Other: value => prettyPrint(value, colors),
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

  const interpreter = new Interpreter(defaultIOHandle);

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