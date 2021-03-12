import { Value } from "./lang/runtime";

export type TutorialHandle = {
  title: (text: string) => void,
  subtitle: (text: string) => void,
  code: (text: string) => void,
  line: (text: string) => Promise<void>,
  error: (text: string) => void,

  prompt: () => Promise<void>,

  eval: (expr: string) => Value,

  askForCodeUntilEquals: (expected: Value) => Promise<void>,
};


const paragraph = async (h: TutorialHandle, ...lines: string[]): Promise<void> => {
  for (const line of lines)
    await h.line(line);
  await h.prompt();
}


const parseTutorial = (source: string): ((h: TutorialHandle) => Promise<void>) => {
  const lines = source.split('\n');

  let currentParagraph: string[] = [];
  const commands: ((h: TutorialHandle) => Promise<void>)[] = [];

  const callbacks: [string, (s: string) => void][] = [
    // Title
    ['T', (s: string) => { commands.push( async h => h.title(s) ) }],

    // Subtitle
    ['S', (s: string) => { commands.push( async h => h.subtitle(s) ) }],

    // Line
    ['L', (s: string) => { commands.push( async h => await h.line(s) ) }],

    // Code prompt
    ['!', (s: string) => { commands.push( async h => await h.askForCodeUntilEquals(h.eval(s))) }],

    // Prompt
    ['?', (s: string) => { commands.push( async h => await h.prompt() ) }],

    // Just code
    ['C', (s: string) => { commands.push( async h => h.code(s) ) }],

    // Paragraph line
    ['.', (s: string) => { currentParagraph.push(s) }],

    // End of paragraph
    ['\n\n', (s: string) => {
      if (currentParagraph.length === 0) return;
      const para = currentParagraph;
      commands.push( async h => await paragraph(h, ...para) );
      currentParagraph = [];
    }],
  ];

  for (const line of lines)
    for (const [tag, cb]  of callbacks)
      if (line.startsWith(tag)) {
        cb(line.slice(tag.length + 1).trimLeft());
        break;
      }

  return async (h: TutorialHandle) => {
    for (const cmd of commands)
      await cmd(h);
  };
};


export const chapter0 = parseTutorial(`
T Chapter 0
S Welcome

. Welcome to the interactive tutorial to $LANG_NAME

. Disclaimer:
. This tutorial assumes some existing programming knowledge.

| Experience with functional programming will help, but is not required.
;

- Enter @37 + 5@ to continue
?= 37 + 5
| Good job!
;

| You can call a function by simply writing arguments after its name,
| just like you run commands at the command line:
;

|= div 17 4
|= div 15 4

| Type those commands to see what results you get:
;

?= div 17 4
- yup
?= div 15 4
- exactly

| As you probably guessed, @div@ divides two integers and discards the remainder.
;

`);
