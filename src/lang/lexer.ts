import { TokenStream } from '../language';
import { ColorHandle } from './color';

export type Tok =
  | 'name'
  | 'dec'
  | 'lp'
  | 'rp'
  | 'lbr'
  | 'rbr'
  | 'lsq'
  | 'rsq'
  | 'comma'
  | 'col'
  | 'op'
  | 'backtick'
  | 'string1'
  | 'string2'
  | 'if'
  | 'then'
  | 'else'
  | 'dot'
  | 'ws'
  | 'semicolon'

const getGroup = (m: RegExpMatchArray) => {
  for (const [k, v] of Object.entries(m.groups || {}))
    if (v !== undefined)
      return {k, v};
  throw new Error('Empty match');
};

const makeRegexp = (...pairs: [Tok, RegExp][]) =>
  new RegExp(
    pairs
    .map(([name, inner]) => `(?<${name}>${inner.source})`)
    .join('|' ),
    'gm'
  );

const re = makeRegexp(
  ['if',        /if\b/                         ],
  ['then',      /then\b/                       ],
  ['else',      /else\b/                       ],
  ['ws',        /\s+|#.*\n?/                   ],
  ['lp',        /\(/                           ],
  ['rp',        /\)/                           ],
  ['lsq',       /\[/                           ],
  ['rsq',       /\]/                           ],
  ['lbr',       /\{/                           ],
  ['rbr',       /\}/                           ],
  ['col',       /:/                            ],
  ['comma',     /,/                            ],
  ['name',      /(?![0-9?!])[a-zA-Z_0-9?!]+/   ],
  ['dec',       /[-]?\d+(\.\d+)?(e[-+]?\d+)?/  ],
  ['dot',       /\.(?=[^-+=*/%!|&^$><?.])/     ],
  ['op',        /[-+=*/%!|&^$><?.]+/           ],
  ['backtick',  /`/                            ],
  ['string1',   /'(?:\\.|[^'])*'/              ],
  ['string2',   /"(?:\\.|[^"])*"/              ],
  ['semicolon', /;/                            ],
);


type LexOptions = { includeWs: boolean };

export const lex = (src: string, options: LexOptions = { includeWs: false }): string | TokenStream<Tok> => {
  const tokens: TokenStream<Tok> = [];
  let latestPos = 0;
  for (const m of src.matchAll(re)) {
    const {k, v} = getGroup(m);

    if (m.index === undefined)
      throw new Error('Impossible');

    if (latestPos < m.index)
      return `I don't understand: ${src.slice(latestPos, m.index)}`;

    if (!['ws'].includes(k) || options.includeWs)
      // @ts-ignore
      tokens.push({type: k, position: m.index, content: v})
    latestPos = m.index + v.length;
  }
  if (latestPos !== src.length)
    return `I don't understand: ${src.slice(latestPos)}`;

  return tokens;
};


// @ts-ignore
const tokenColor = (tokenType: Tok): keyof ColorHandle => ({
  'if': 'keyword',
  'then': 'keyword',
  'else': 'keyword',
  'ws': 'comment',
  'lp': 'punctuation',
  'rp': 'punctuation',
  'lsq': 'punctuation',
  'rsq': 'punctuation',
  'lbr': 'punctuation',
  'rbr': 'punctuation',
  'col': 'punctuation',
  'semicolon': 'punctuation',
  'comma': 'punctuation',
  'name': 'name',
  'dot': 'constant',
  'num': 'num',
  'op': 'keyword',
  'backtick': 'keyword',
  'string1': 'str',
  'string2': 'str'
}[tokenType]);


const _highlightGen = function* (tokens: TokenStream<Tok>, h: ColorHandle) {
  for (const token of tokens){
    const col = tokenColor(token.type);
    if (col === null)
      yield token.content;
    else
      yield h[col](token.content);
  }
};

export const highlightCode =
  (code: string, h: ColorHandle): [boolean, string] => {
  const tokens = lex(code, {includeWs: true});
  if (typeof tokens === 'string')
    return [false, tokens];
  return [true, [..._highlightGen(tokens, h)].join('')];
};
