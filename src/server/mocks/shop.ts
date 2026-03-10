export const MOCK_SHOP_ITEMS = [
  { key: '走', desc: 'なし', move: '前方2マス', cost: 2, costType: 'pawn' },
  {
    key: '種',
    desc: '移動時30％で周囲に「葉」を召喚',
    move: '前斜め1マス',
    cost: 3,
    costType: 'gold',
  },
  {
    key: '麒',
    desc: '金・銀・歩から取られない',
    move: '縦横無制限+斜め1',
    cost: 20,
    costType: 'gold',
  },
  { key: '舞', desc: '周囲の敵駒を行動制限', move: '金と同じ', cost: 6, costType: 'gold' },
  { key: 'P', desc: '同列同段の敵を行動不能', move: '縦横1マス', cost: 40, costType: 'gold' },
  { key: '鳴', desc: '同種3体をまとめて取る', move: '前斜め1マス', cost: 50, costType: 'pawn' },
] as const;

export const MOCK_SHOP_CURRENCY = {
  pawnCurrency: 0,
  goldCurrency: 0,
} as const;

export const MOCK_SHOP_OWNED: Array<(typeof MOCK_SHOP_ITEMS)[number]['key']> = [];
