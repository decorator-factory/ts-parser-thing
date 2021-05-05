import * as fs from 'fs';
import { runCode, readEvalPrintLoop } from './execution';
import { Interpreter } from './lang/interpreter';


const simplyRunCode = (sourceCode: string) => {
  const interpreter = new Interpreter();
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
  if (!filename){
    console.error('You must provide a filename');
  } else {
    const sourceCode = fs.readFileSync(filename, 'utf-8');
    simplyRunCode(sourceCode);
  }
} else {
  console.log('Only `npm start repl`, `npm start stdin` and `npm start file` are supported for now');
}
