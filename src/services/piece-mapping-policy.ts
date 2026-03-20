export type PieceSeedRow = {
  pieceCode: string;
  kanji: string;
  pieceId?: number;
  isPromoted: boolean;
};

export type PlannedPieceMapping = {
  pieceCode: string;
  kanji: string;
  displayChar: string;
  sfenCode: string;
  canonicalCode: string;
  isSpecial: boolean;
  isPromoted: boolean;
};

type ExplicitMapping = Omit<PlannedPieceMapping, 'pieceCode' | 'kanji' | 'isPromoted'> & {
  kanji: string;
};

const EXPLICIT_MAPPINGS: readonly ExplicitMapping[] = [
  { kanji: '歩', displayChar: 'FU', sfenCode: 'P', canonicalCode: 'pawn', isSpecial: false },
  { kanji: '香', displayChar: 'KY', sfenCode: 'L', canonicalCode: 'lance', isSpecial: false },
  { kanji: '桂', displayChar: 'KE', sfenCode: 'N', canonicalCode: 'knight', isSpecial: false },
  { kanji: '銀', displayChar: 'GI', sfenCode: 'S', canonicalCode: 'silver', isSpecial: false },
  { kanji: '金', displayChar: 'KI', sfenCode: 'G', canonicalCode: 'gold', isSpecial: false },
  { kanji: '角', displayChar: 'KA', sfenCode: 'B', canonicalCode: 'bishop', isSpecial: false },
  { kanji: '飛', displayChar: 'HI', sfenCode: 'R', canonicalCode: 'rook', isSpecial: false },
  { kanji: '玉', displayChar: 'OU', sfenCode: 'K', canonicalCode: 'king', isSpecial: false },
  { kanji: 'と', displayChar: 'TO', sfenCode: '+P', canonicalCode: 'prom_pawn', isSpecial: false },
  {
    kanji: '成香',
    displayChar: 'NY',
    sfenCode: '+L',
    canonicalCode: 'prom_lance',
    isSpecial: false,
  },
  {
    kanji: '成桂',
    displayChar: 'NK',
    sfenCode: '+N',
    canonicalCode: 'prom_knight',
    isSpecial: false,
  },
  {
    kanji: '成銀',
    displayChar: 'NG',
    sfenCode: '+S',
    canonicalCode: 'prom_silver',
    isSpecial: false,
  },
  {
    kanji: '馬',
    displayChar: 'UM',
    sfenCode: '+B',
    canonicalCode: 'prom_bishop',
    isSpecial: false,
  },
  { kanji: '龍', displayChar: 'RY', sfenCode: '+R', canonicalCode: 'prom_rook', isSpecial: false },
  { kanji: '忍', displayChar: 'NIN', sfenCode: 'C', canonicalCode: 'ninja', isSpecial: true },
  { kanji: '影', displayChar: 'KAG', sfenCode: 'D', canonicalCode: 'shadow', isSpecial: true },
  { kanji: '砲', displayChar: 'HOU', sfenCode: 'E', canonicalCode: 'cannon', isSpecial: true },
  { kanji: '竜', displayChar: 'RYU', sfenCode: 'F', canonicalCode: 'dragon', isSpecial: true },
  { kanji: '鳳', displayChar: 'HOO', sfenCode: 'H', canonicalCode: 'phoenix', isSpecial: true },
  { kanji: '炎', displayChar: 'ENN', sfenCode: 'I', canonicalCode: 'flame', isSpecial: true },
  { kanji: '火', displayChar: 'FIR', sfenCode: 'J', canonicalCode: 'fire', isSpecial: true },
  { kanji: '水', displayChar: 'SUI', sfenCode: 'M', canonicalCode: 'water', isSpecial: true },
  { kanji: '波', displayChar: 'NAM', sfenCode: 'Q', canonicalCode: 'wave', isSpecial: true },
  { kanji: '木', displayChar: 'MOK', sfenCode: 'T', canonicalCode: 'tree', isSpecial: true },
  { kanji: '葉', displayChar: 'HAA', sfenCode: 'U', canonicalCode: 'leaf', isSpecial: true },
  { kanji: '光', displayChar: 'HIK', sfenCode: 'V', canonicalCode: 'light', isSpecial: true },
  { kanji: '星', displayChar: 'HOS', sfenCode: 'W', canonicalCode: 'star', isSpecial: true },
  { kanji: '闇', displayChar: 'YAM', sfenCode: 'X', canonicalCode: 'dark', isSpecial: true },
  { kanji: '魔', displayChar: 'MAK', sfenCode: 'Y', canonicalCode: 'demon', isSpecial: true },
] as const;

const explicitByKanji = new Map(EXPLICIT_MAPPINGS.map((entry) => [entry.kanji, entry]));

function makeGeneratedDisplay(index: number): string {
  return `PC${String(index).padStart(3, '0')}`;
}

function makeGeneratedSfen(index: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const first = Math.floor(index / alphabet.length);
  const second = index % alphabet.length;
  if (first >= alphabet.length) {
    throw new Error(`generated SFEN token space exhausted at index ${index}`);
  }
  return `Z${alphabet[first]}${alphabet[second]}`;
}

export function planPieceMappings(rows: readonly PieceSeedRow[]): PlannedPieceMapping[] {
  const planned: PlannedPieceMapping[] = [];
  const usedDisplay = new Set<string>();
  const usedSfen = new Set<string>();
  let generatedDisplayIndex = 1;
  let generatedSfenIndex = 0;

  for (const row of rows) {
    const explicit = explicitByKanji.get(row.kanji);
    if (explicit) {
      planned.push({
        pieceCode: row.pieceCode,
        kanji: row.kanji,
        displayChar: explicit.displayChar,
        sfenCode: explicit.sfenCode,
        canonicalCode: explicit.canonicalCode,
        isSpecial: explicit.isSpecial,
        isPromoted: row.isPromoted,
      });
      usedDisplay.add(explicit.displayChar);
      usedSfen.add(explicit.sfenCode);
      continue;
    }

    let displayChar = makeGeneratedDisplay(generatedDisplayIndex);
    while (usedDisplay.has(displayChar)) {
      generatedDisplayIndex += 1;
      displayChar = makeGeneratedDisplay(generatedDisplayIndex);
    }
    usedDisplay.add(displayChar);
    generatedDisplayIndex += 1;

    let sfenCode = makeGeneratedSfen(generatedSfenIndex);
    while (usedSfen.has(sfenCode)) {
      generatedSfenIndex += 1;
      sfenCode = makeGeneratedSfen(generatedSfenIndex);
    }
    usedSfen.add(sfenCode);
    generatedSfenIndex += 1;

    planned.push({
      pieceCode: row.pieceCode,
      kanji: row.kanji,
      displayChar,
      sfenCode,
      canonicalCode: row.pieceCode,
      isSpecial: true,
      isPromoted: row.isPromoted,
    });
  }

  return planned;
}

export function isUnifiedDisplayChar(value: string): boolean {
  return /^[A-Z0-9]+$/.test(value);
}
