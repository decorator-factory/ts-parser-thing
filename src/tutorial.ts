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


export const chapter0 = async (h: TutorialHandle) => {
  h.title("Chapter 0");
  h.subtitle("Welcome");

  await paragraph(h,
    "Welcome to the interactive tutorial to `$LANG_NAME`!",
  );

  await paragraph(h,
    "Disclaimer:",
    "This tutorial assumes some existing programming knowledge.",
  );

  await paragraph(h,
    "Experience with functional programming will help, but is not required.",
  );

  await paragraph(h,
    "In this tutorial, you're going to interact with the ^interactive console^.",
    "It's a prompt where you can type expressions to be executed.",
  );

  await h.line('Enter `37 + 5` to continue:');

  await h.askForCodeUntilEquals(h.eval('42'));

  await paragraph(h,
    'Good job!'
  );
};
