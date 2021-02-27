import * as readline from 'readline';
import { Interpreter, LangError } from './lang/interpreter';
import { computeDiff, prettyPrint, RuntimeError, Value } from './lang/runtime';
import { ColorHandle, identityColorHandle } from './lang/color';
import { highlightCode } from './lang/lexer';
import chalk from 'chalk';
import { TutorialHandle, chapter0 } from './tutorial';
import { Either, Err, Ok } from './either';
import * as Ei from './either';



const runCode = (() => {
  const printErrorType = (k: RuntimeError['type']): string => ({
    'missingKey': 'missing key',
    'unexpectedType': 'unexpected type',
    'undefinedName': 'name not defined',
  }[k]);

  const printErrorDetails = (e: RuntimeError): string => {
    switch (e.type) {
      case 'missingKey':
        return e.details.key;
      case 'undefinedName':
        return e.details.name;
      case 'unexpectedType':
        return `expected ${e.details.expected}, got ${prettyPrint(e.details.got, colors)}`
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

  return (interpreter: Interpreter, inputLine: string): Either<string, Value> => {
    const result = interpreter.runLine(inputLine);
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
    native: chalk.rgb(63, 232, 125),
    name: chalk.rgb(210, 247, 231),
    keyword: chalk.bold.rgb(252, 38, 109),

    brace: chalk.rgb(252, 197, 215),
    bracket: chalk.rgb(219, 242, 255),

    arg: chalk.underline.rgb(158, 252, 86),
    argBracket: chalk.rgb(127, 237, 43),
  };


  const colorsSimple: ColorHandle = {
    ...identityColorHandle,
    str: chalk.yellowBright,
    num: chalk.magentaBright,
    constant: chalk.magenta,
    native: chalk.cyanBright,
    name: chalk.whiteBright,
    keyword: chalk.red,

    arg: chalk.greenBright,
    argBracket: chalk.green,
  };

  return chalk.level <= 2 ? colorsSimple : colorsRgb;
})();


const main = () => {
  const formatPrompt = () => chalk.greenBright('λ > ');

  const interpreter = new Interpreter(() => process.exit());

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Gracefully handle CTRL+C
  rl.on('SIGINT', () => {
    rl.question("Exit [y/n]? ", answer => {
      if (["y", "Y", "yes"].includes(answer))
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
    if (input.trim() !== '')
      runCode(interpreter, input);
    prompt();
  });
};


const tutorialHandle: TutorialHandle = (() => {
  const dedent = (s: string): string => {
    const lines = s.split('\n');
    const dedentAmount = lines.slice(1).reduce((acc, next) => Math.min(acc, next.length), 0);
    return lines.map(line => line.slice(dedentAmount)).join('');
  };

  const indent = (s: string, indentAmount: number): string =>
    s.split('\n').map(line => ' '.repeat(indentAmount)).join('');

  const indentTo = (s: string, indentAmount: number): string =>
    indent(dedent(s), indentAmount);

  const h: TutorialHandle = {
    title: s => {
      console.log();
      console.log();
      console.log('  ' + chalk.bold(chalk.redBright(s)));
      console.log();
    },
    subtitle: s => {
      console.log();
      console.log('    ' + chalk.yellowBright(s));
      console.log();
    },
    line: async (s) => {
      const formatted =
        s
        .replace(/\^([^^]+)\^/g, subs => chalk.italic(subs.slice(1, -1)))
        .replace(/`([^`]+)`/g, subs => chalk.bgBlack.greenBright(subs.slice(1, -1)));

      for (const c of formatted) {
        process.stdout.write(c);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      await new Promise(resolve => setTimeout(resolve, 120));
      process.stdout.write('\n');
    },
    code: s => {
      console.log(highlightCode(indentTo(s, 2), colors))
    },
    error: s => {
      console.log('! ' + s);
    },
    askForCodeUntilEquals: expectedValue => new Promise(resolve => {
      const promptText = chalk.greenBright('λ > ');
      const prompt = () => {
        process.stdout.write(promptText, 'utf-8');
      };

      const interpreter = new Interpreter(() => process.exit());
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.setPrompt(promptText);

      // Gracefully handle CTRL+C
      rl.on('SIGINT', () => {
        rl.question("Exit [y/n]? ", answer => {
          if (["y", "Y", "yes"].includes(answer))
            process.exit();
          else
            prompt();
        })
      });

      prompt();
      rl.on('line', inputLine => {
        if (inputLine.trim() === '') {
          prompt();
          return;
        }
        const result = runCode(interpreter, inputLine);
        if ('ok' in result) {
          console.log(prettyPrint(result.ok, colors));
          const diff = computeDiff(expectedValue, result.ok);
          if (diff === null) {
            resolve();
            rl.close();
            return;
          } else {
            console.log(chalk.redBright('Wrong result: ') + diff);
          }
        } else {
          console.log(result.err);
        }
        prompt();
      });

    }),

    eval: code => {
      const interpreter = new Interpreter(() => process.exit());
      const result = runCode(interpreter, code);
      if ('err' in result)
        throw new Error(result.err);
      return result.ok;
    },

    prompt: () => new Promise(resolve => {
      process.stdout.write(chalk.italic.gray('press Enter to continue '));

      const rl = readline.createInterface({input: process.stdin, output: process.stdout});
      rl.on('line', () => {
        process.stdout.moveCursor(0, -1);
        process.stdout.clearLine(0);
        process.stdout.write('\n');
        resolve();
        rl.close();
      });
    }),
  };

  return h;
})();


if (process.argv.slice(-1)[0] === 'tutorial')
  chapter0(tutorialHandle);
else
  main();
