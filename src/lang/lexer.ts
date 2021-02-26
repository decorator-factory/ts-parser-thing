import {TokenStream} from '../language';

export type Tok =
  | 'name'
  | 'num'
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
    .join('|'),
    'gm'
  );

const re = makeRegexp(
  ['if',        /if\b/                         ],
  ['then',      /then\b/                       ],
  ['else',      /else\b/                       ],
  ['ws',        /\s+/                          ],
  ['lp',        /\(/                           ],
  ['rp',        /\)/                           ],
  ['lsq',       /\[/                           ],
  ['rsq',       /\]/                           ],
  ['lbr',       /\{/                           ],
  ['rbr',       /\}/                           ],
  ['col',       /:/                            ],
  ['comma',     /,/                            ],
  ['name',      /(?![0-9?!])[a-zA-Z_0-9?!]+/   ],
  ['dot',       /\./                           ],
  ['num',       /[-+]?(?:0|[1-9][0-9]*)/       ],
  ['op',        /[-+=*/%!|&^$><?]+/            ],
  ['backtick',  /`/                            ],
  ['string1',   /'(?:\\.|[^'])*'/              ],
  ['string2',   /"(?:\\.|[^"])*"/              ],
);

export const lex = (src: string): TokenStream<Tok> => {
  const tokens: TokenStream<Tok> = [];
  for (const m of src.matchAll(re)) {
    const {k, v} = getGroup(m);
    if (!['ws'].includes(k))
      // @ts-ignore
      tokens.push({type: k, position: m.index, content: v})
  }
  return tokens;
};
