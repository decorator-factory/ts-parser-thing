import * as readline from 'readline';
import { Interpreter } from './lang/interpreter';
import { lex } from './lang/lexer';
import { makeParser } from './lang/parser';
import { prettyPrint } from './lang/runtime';
import { consume } from './language';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


const prompt = () => {
  process.stdout.write('λ> ', 'utf-8');
};
rl.setPrompt('λ> ');


const interpreter = new Interpreter();


const runCode = (inputLine: string): void => {
  const result = interpreter.runLine(inputLine);
  if ('ok' in result)
    console.log(prettyPrint(result.ok));
  else
    console.log(result.err);
};


prompt();
rl.on('line', input => {
  if (input.trim() !== '')
    runCode(input);
  prompt();
});
