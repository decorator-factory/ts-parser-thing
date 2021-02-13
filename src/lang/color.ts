type Format = (s: string) => string;
type TokenType =
  | 'str'
  | 'num'
  | 'constant'
  | 'native'
  | 'symbol'
  | 'bracket'
  | 'brace'
  | 'name'
  | 'keyword'
  | 'arg'
  | 'argBracket'
  ;

export type ColorHandle = Record<TokenType, Format>;

export const identityColorHandle: ColorHandle = {
  str: s => s,
  num: s => s,
  constant: s => s,
  native: s => s,
  symbol: s => s,
  bracket: s => s,
  brace: s => s,
  name: s => s,
  keyword: s => s,
  arg: s => s,
  argBracket: s => s,
};
