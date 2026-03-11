import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSql(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function findAll(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern));
}

describe('master seed/migration integrity', () => {
  it('generated seed SQL contains inserts for required master tables', () => {
    const sql = readSql('scripts/generated/seed_master_piece.sql');

    expect(sql).toContain('insert into master.m_move_pattern (');
    expect(sql).toContain('insert into master.m_move_pattern_vector (');
    expect(sql).toContain('insert into master.m_skill (');
    expect(sql).toContain('insert into master.m_piece (');
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');

    const pieceRows = findAll(sql, /\('piece_[a-z0-9]+'/g);
    expect(pieceRows.length).toBeGreaterThanOrEqual(110);

    const patternRows = findAll(
      sql,
      /\('[a-zA-Z][a-zA-Z0-9]*',\s*'[a-zA-Z][a-zA-Z0-9]*',\s*(?:true|false),\s*(?:true|false),\s*(?:NULL::jsonb|'\{[^']+'\:\:[ ]?jsonb|'[^']*'::jsonb)/g,
    );
    expect(patternRows.length).toBeGreaterThanOrEqual(100);
  });

  it('reseed migration re-populates vectors/rules and includes representative complex moves', () => {
    const sql = readSql(
      'supabase/migrations/20260311114000_reseed_move_vectors_from_piece_info.sql',
    );

    expect(sql).toContain('delete from master.m_move_pattern_vector as v');
    expect(sql).toContain('insert into master.m_move_pattern_vector (');
    expect(sql).toContain('delete from master.m_move_pattern_rule as r');
    expect(sql).toContain('insert into master.m_move_pattern_rule (');
    expect(sql).toContain('update master.m_piece as p');

    const updatedMoves = findAll(
      sql,
      /\('[a-zA-Z][a-zA-Z0-9]*',\s*(?:true|false),\s*(?:true|false),\s*'\{"mode":"piece_info_canMoveTo","source_move_code":"[a-zA-Z][a-zA-Z0-9]*"\}'::jsonb\)/g,
    );
    expect(updatedMoves.length).toBeGreaterThanOrEqual(110);

    expect(sql).toContain("('dragon', -1, -1, 3, false, false)");
    expect(sql).toContain("('cloud', 0, -1, 3, false, false)");
    expect(sql).toContain("('gun', 0, -1, 2, false, false)");
    expect(sql).toContain("('rainbow', 0, -1, 1, false, false)");
    expect(sql).toContain("('lamp', -1, 0, 1, false, false)");

    expect(sql).toContain("('moon', 'turn_parity_override', 10");
    expect(sql).toContain("('mirror', 'copy_front_enemy_move', 10");
    expect(sql).toContain("('book', 'copy_last_enemy_move', 10");
    expect(sql).toContain("('house', 'immobile', 0");
  });
});
