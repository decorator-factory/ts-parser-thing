import {TokenStream} from '../language';

export type Tok =
  | 'name'
  | 'num'
  | 'lp'
  | 'rp'
  | 'lbr'
  | 'rbr'
  | 'col'
  | 'op'
  | 'infixName'

const getGroup = (m: RegExpMatchArray) => {
  for (const [k, v] of Object.entries(m.groups || {}))
    if (v !== undefined)
      return {k, v};
  throw new Error('Empty match');
};

const makeRegexp = (...pairs: [string, RegExp][]) =>
  new RegExp(
    pairs
    .map(([name, inner]) => `(?<${name}>${inner.source})`)
    .join('|'),
    'gm'
  );

export const lex = (src: string): TokenStream<Tok> => {
  const re = makeRegexp(
    ['ws',        /\s+/                      ],
    ['lp',        /\(/                       ],
    ['rp',        /\)/                       ],
    ['lbr',       /\{/                       ],
    ['rbr',       /\}/                       ],
    ['col',       /:/                        ],
    ['name',      /(?![0-9])[a-zA-Z_0-9]+/   ],
    ['num',       /[-+]?(?:0|[1-9][0-9]*)/   ],
    ['op',        /[-+=*/%!|&*^$]+/          ],
    ['infixName', /`(?![0-9])[a-zA-Z_0-9]+`/ ],
  );
  const tokens: TokenStream<Tok> = [];
  for (const m of src.matchAll(re)) {
    const {k, v} = getGroup(m);
    if (!['ws'].includes(k))
      // @ts-ignore
      tokens.push({type: k, position: m.index, content: v})
  }
  return tokens;
};
