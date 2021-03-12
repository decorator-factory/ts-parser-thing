type Format = (s: string) => string;
type TokenType =
  | 'str'
  | 'num'
  | 'constant'
  | 'punctuation'
  | 'name'
  | 'keyword'
  | 'arg'
  | 'comment'
  ;

export type ColorHandle = Record<TokenType, Format>;

export const identityColorHandle: ColorHandle = {
  str: s => s,
  num: s => s,
  constant: s => s,
  punctuation: s => s,
  name: s => s,
  keyword: s => s,
  arg: s => s,
  comment: s => s,
};
