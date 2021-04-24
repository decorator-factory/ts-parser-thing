import * as readline from 'readline';
import { Interpreter, LangError } from './lang/interpreter';
import { computeDiff, prettyPrint, RuntimeError, Value } from './lang/runtime';
import { ColorHandle, identityColorHandle } from './lang/color';
import { highlightCode } from './lang/lexer';
import chalk from 'chalk';
import { Either, Err, Ok } from './either';
import * as fs from 'fs';



const runCode = (() => {
  const printErrorType = (k: RuntimeError['type']): string => ({
    'missingKey': 'missing key',
    'unexpectedType': 'unexpected type',
    'undefinedName': 'name not defined',
    'dimensionMismatch': 'dimension mismatch',
    'notInDomain': 'value not in domain',
  }[k]);

  const printErrorDetails = (e: RuntimeError): string => {
    switch (e.type) {
      case 'missingKey':
        return e.details.key;
      case 'undefinedName':
        return e.details.name;
      case 'unexpectedType':
        return `expected ${e.details.expected}, got ${prettyPrint(e.details.got, colors)}`;
      case 'dimensionMismatch':
        return `between ${JSON.stringify(e.details.left)} and ${JSON.stringify(e.details.right)}`;
      case 'notInDomain':
        return `value ${prettyPrint(e.details.value, colors)} is outside the domain (${e.details.domain}), context: ${e.details.ctx}`;
    }
  };

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
              printErrorType(e.err.type) + ': ' + printErrorDetails(e.err)
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


const readEvalPrintLoop = () => {
  const formatPrompt = () => chalk.greenBright('λ > ');

  const interpreter = new Interpreter(() => process.exit());

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


const simplyRunCode = (sourceCode: string) => {
  const interpreter = new Interpreter(() => process.exit());
  const result = runCode(interpreter, sourceCode);
  if ('err' in result)
    console.error(result.err);
};


if (process.argv[2] === 'repl') {
  readEvalPrintLoop();
} else if (process.argv[2] === 'stdin') {
  const STDIN_FD = 0;
  const sourceCode = fs.readFileSync(STDIN_FD, 'utf-8');
  simplyRunCode(sourceCode);
} else if (process.argv[2] === 'file') {
  const filename = process.argv[3];
  if (!filename)
    console.error('You must provide a filename');
  const sourceCode = fs.readFileSync(filename, 'utf-8');
  simplyRunCode(sourceCode);
} else {
  console.log('Only `npm run repl`, `npm run stdin` and `npm run file` are supported for now');
}
