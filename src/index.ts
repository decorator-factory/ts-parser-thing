import * as readline from 'readline';
import { run, prettyPrint, PARSER } from './lang/interpreter';
import { lex } from './lang/lexer';
import { makeParser } from './lang/parser';
import { consume } from './language';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


const prompt = () => {
  process.stdout.write('λ> ', 'utf-8');
};
rl.setPrompt('λ> ');


const runCode = (input: string): void => {
  const parser = PARSER;
  let tokens;
  try {
    tokens = lex(input)
  } catch (e) {
    console.log(e);
    return;
  }

  let ast;
  try {
    const ea = consume(parser, tokens);
    if ('err' in ea) {
      console.log('Parse error:', ea.err);
      console.log('Tokens:');
      console.dir(tokens, {depth: null});
      return;
    }
    ast = ea.ok
  } catch (e) {
    console.log(e);
    return;
  }

  try {
    console.log(prettyPrint(run(ast)));
  } catch (e) {
    console.log(e);
    return;
  }
};


prompt();
rl.on('line', input => {
  if (input.trim() !== '')
    runCode(input);
  prompt();
});
