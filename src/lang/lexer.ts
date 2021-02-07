import {TokenStream} from '../language';

export type Tok =
  | 'name'
  | 'tilde'
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
  | 'infixName'
  | 'string1'
  | 'string2'

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
    ['lsq',       /\[/                       ],
    ['rsq',       /\]/                       ],
    ['lbr',       /\{/                       ],
    ['rbr',       /\}/                       ],
    ['col',       /:/                        ],
    ['comma',     /,/                        ],
    ['name',      /(?![0-9])[a-zA-Z_0-9]+/   ],
    ['tilde',     /~/                        ],
    ['num',       /[-+]?(?:0|[1-9][0-9]*)/   ],
    ['op',        /[-+=*/%!|&^$.><?]+/       ],
    ['infixName', /`(?![0-9])[a-zA-Z_0-9]+`/ ],
    ['string1',   /'(?:\\.|[^'])*'/          ],
    ['string2',   /"(?:\\.|[^"])*"/          ],
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
