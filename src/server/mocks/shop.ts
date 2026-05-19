export const MOCK_SHOP_ITEMS = [
  {
    key: '走',
    desc: 'なし',
    move: '前方に最大2マス進める。1マス目に駒がある場合は2マス目には進めない。',
    cost: 2,
    costType: 'pawn',
  },
  {
    key: '種',
    desc: '移動時20%の確率で、周囲8マスのランダムな空きマス1マスに「葉」駒を召喚する。',
    move: '前斜め4方向に1マス移動できる。',
    cost: 3,
    costType: 'gold',
  },
  {
    key: '麒',
    desc: '「金」「銀」「歩」駒から取られない。',
    move: '前後左右に何マスでも進める。斜め4方向に1マス進める。',
    cost: 20,
    costType: 'gold',
  },
  {
    key: '舞',
    desc: '移動時、その時点で周囲8マスにいる敵駒の移動範囲を斜め前1マスのみに制限する。',
    move: '前・前斜め左右・左右・後に各1マス進める。',
    cost: 6,
    costType: 'gold',
  },
  { key: 'P', desc: '同列同段の敵を行動不能', move: '縦横1マス', cost: 40, costType: 'gold' },
  { key: '鳴', desc: '同種3体をまとめて取る', move: '前斜め1マス', cost: 50, costType: 'pawn' },
] as const;

export const MOCK_SHOP_CURRENCY = {
  pawnCurrency: 0,
  goldCurrency: 0,
} as const;

export const MOCK_SHOP_OWNED: Array<(typeof MOCK_SHOP_ITEMS)[number]['key']> = [];
