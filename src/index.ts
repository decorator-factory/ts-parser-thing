import * as readline from 'readline';
import { Interpreter, LangError } from './lang/interpreter';
import { prettyPrint, Value } from './lang/runtime';
import { ColorHandle, identityColorHandle } from './lang/color';
import { Map } from 'immutable';
import chalk from 'chalk';


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});



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

const interpreters: Interpreter[] = [
  new Interpreter(
    0,
    {
      spawnChild: baseEnv => pushInterpreter(baseEnv),
      exit: () => popInterpreter(),
      bringInterpreterToTop: id => bringInterpreterToTop(id),
      findInterpreter: id => findInterpreter(id),
      topInterpreter: () => topInterpreter(),
    }
  )
];


const formatPrompt = () => chalk.underline(
  chalk.greenBright('λ ')
  + chalk.yellowBright(interpreters.map(i => `${i.id}`).join(':'))
  + chalk.greenBright(' >')
) + ' ';

const prompt = () => {
  process.stdout.write(formatPrompt(), 'utf-8');
};
rl.setPrompt(formatPrompt());

const pushInterpreter = (baseEnv: Map<string, Value>) => {
  const newInterpreter = topInterpreter().derive(baseEnv);
  interpreters.push(newInterpreter);
  updatePrompt();
  return newInterpreter;
};

const topInterpreter = () => interpreters.slice(-1)[0];

const updatePrompt = () => {
  rl.setPrompt(formatPrompt());
};

const popInterpreter = () => {
  interpreters.pop();
  if (interpreters.length === 0)
    process.exit(0);
  updatePrompt();
};

const findInterpreter = (id: number): Interpreter | null => {
  const int = interpreters.find(i => i.id === id);
  return int || null;
};

const bringInterpreterToTop = (id: number): Interpreter | null => {
  const int = findInterpreter(id)
  if (int)
    interpreters.push(int)
  updatePrompt();
  return int;
};

const runCode = (inputLine: string): void => {
  const result = topInterpreter().runLine(inputLine);
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
