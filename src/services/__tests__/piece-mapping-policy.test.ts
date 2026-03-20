import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isUnifiedDisplayChar,
  planPieceMappings,
  type PieceSeedRow,
} from '@/services/piece-mapping-policy';

function readSql(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function loadPieceSeedRows(): PieceSeedRow[] {
  const baseSql = readSql('scripts/generated/seed_master_piece.sql');
  const promotedSql = readSql('supabase/migrations/20260319114500_seed_shogi_promoted_pieces.sql');

  const baseStart = baseSql.indexOf('insert into master.m_piece (');
  const baseEnd = baseSql.indexOf('insert into master.m_stage (', baseStart);
  const baseSection = baseSql.slice(baseStart, baseEnd === -1 ? undefined : baseEnd);

  const promotedStart = promotedSql.indexOf("('piece_shogi_to'");
  const promotedEnd = promotedSql.indexOf(
    ') as v(piece_code, kanji, name, move_code)',
    promotedStart,
  );
  const promotedSection = promotedSql.slice(
    promotedStart,
    promotedEnd === -1 ? undefined : promotedEnd,
  );

  const rows: PieceSeedRow[] = [];
  for (const match of baseSection.matchAll(/\('([^']+)',\s*'([^']+)',\s*'([^']+)',/g)) {
    rows.push({
      pieceCode: match[1],
      kanji: match[2],
      isPromoted: false,
    });
  }
  for (const match of promotedSection.matchAll(
    /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g,
  )) {
    rows.push({
      pieceCode: match[1],
      kanji: match[2],
      isPromoted: true,
    });
  }
  return rows;
}

describe('piece mapping policy', () => {
  it('covers every seeded piece with a unified display_char and unique sfen_code', () => {
    const rows = loadPieceSeedRows();
    const mappings = planPieceMappings(rows);

    expect(mappings.length).toBe(rows.length);
    expect(new Set(mappings.map((entry) => entry.displayChar)).size).toBe(mappings.length);
    expect(new Set(mappings.map((entry) => entry.sfenCode)).size).toBe(mappings.length);
    expect(mappings.every((entry) => isUnifiedDisplayChar(entry.displayChar))).toBe(true);
  });

  it('preserves standard SFEN compatibility for normal and promoted shogi pieces', () => {
    const mappings = planPieceMappings(loadPieceSeedRows());
    const byKanji = new Map(mappings.map((entry) => [entry.kanji, entry]));

    expect(byKanji.get('歩')?.sfenCode).toBe('P');
    expect(byKanji.get('香')?.sfenCode).toBe('L');
    expect(byKanji.get('桂')?.sfenCode).toBe('N');
    expect(byKanji.get('銀')?.sfenCode).toBe('S');
    expect(byKanji.get('金')?.sfenCode).toBe('G');
    expect(byKanji.get('角')?.sfenCode).toBe('B');
    expect(byKanji.get('飛')?.sfenCode).toBe('R');
    expect(byKanji.get('玉')?.sfenCode).toBe('K');
    expect(byKanji.get('と')?.sfenCode).toBe('+P');
    expect(byKanji.get('成香')?.sfenCode).toBe('+L');
    expect(byKanji.get('成桂')?.sfenCode).toBe('+N');
    expect(byKanji.get('成銀')?.sfenCode).toBe('+S');
    expect(byKanji.get('馬')?.sfenCode).toBe('+B');
    expect(byKanji.get('龍')?.sfenCode).toBe('+R');
  });

  it('keeps existing special-piece display_char assignments and removes kanji fallback', () => {
    const mappings = planPieceMappings(loadPieceSeedRows());
    const byKanji = new Map(mappings.map((entry) => [entry.kanji, entry]));

    expect(byKanji.get('忍')?.displayChar).toBe('NIN');
    expect(byKanji.get('影')?.displayChar).toBe('KAG');
    expect(byKanji.get('砲')?.displayChar).toBe('HOU');
    expect(byKanji.get('鳳')?.displayChar).toBe('HOO');
    expect(mappings.some((entry) => entry.displayChar === entry.kanji)).toBe(false);
  });
});
