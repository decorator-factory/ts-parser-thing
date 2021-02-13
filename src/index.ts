import * as readline from 'readline';
import { Interpreter, LangError } from './lang/interpreter';
import { prettyPrint } from './lang/runtime';
import { ColorHandle, identityColorHandle } from './lang/color';
import chalk from 'chalk';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


const prompt = () => {
  process.stdout.write('λ> ', 'utf-8');
};
rl.setPrompt('λ> ');


const interpreter = new Interpreter();


const printError = (e: LangError): string => {
  switch (e.type) {
    case 'lexError':
      return chalk.red('Lex error: ') + chalk.yellowBright(e.msg);
    case 'parseError':
      return chalk.red('Parse error: ') + chalk.yellowBright(e.msg);
    case 'runtimeError':
      return chalk.red('Runtime error: ') + chalk.yellowBright(e.msg);
  }
}


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

const colors = chalk.level <= 2 ? colorsSimple : colorsRgb;


const runCode = (inputLine: string): void => {
  const result = interpreter.runLine(inputLine);
  if ('ok' in result)
    console.log(prettyPrint(result.ok, colors));
  else
    console.log(printError(result.err));
};


prompt();
rl.on('line', input => {
  if (input.trim() !== '')
    runCode(input);
  prompt();
});
