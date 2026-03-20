import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const env = fs.readFileSync('.env', 'utf-8')
const url = env.match(/SUPABASE_URL=(.+)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()

const supabase = createClient(url, key, { db: { schema: 'master' } })

// スキル全件
const { data: skills } = await supabase
  .from('m_skill')
  .select('skill_id, skill_code, skill_desc, skill_type, target_rule, effect_summary_type, trigger_timing, parse_status, proc_chance, duration_turns, params_json')
  .order('skill_id')

// 駒全件（skill_idを持つもの）
const { data: pieces } = await supabase
  .from('m_piece')
  .select('piece_id, kanji, name, skill_id, rarity')
  .not('skill_id', 'is', null)
  .order('skill_id')

// skill_id → 駒リスト のマップ
const pieceMap = {}
for (const p of pieces) {
  if (!pieceMap[p.skill_id]) pieceMap[p.skill_id] = []
  pieceMap[p.skill_id].push(`${p.kanji}(${p.name})`)
}

// 出力
let lines = []
lines.push('# スキル一覧（構造化作戦会議用）')
lines.push('')
lines.push('| ID | 駒名 | skill_desc | skill_type | target_rule | effect_summary_type | trigger_timing | proc_chance | duration_turns | parse_status |')
lines.push('|----|------|-----------|-----------|------------|-------------------|--------------|------------|--------------|------------|')

for (const s of skills) {
  const pieces = pieceMap[s.skill_id] ? pieceMap[s.skill_id].join(', ') : '（なし）'
  const proc = s.proc_chance != null ? s.proc_chance : ''
  const dur = s.duration_turns != null ? s.duration_turns : ''
  lines.push(`| ${s.skill_id} | ${pieces} | ${s.skill_desc} | ${s.skill_type} | ${s.target_rule} | ${s.effect_summary_type} | ${s.trigger_timing} | ${proc} | ${dur} | ${s.parse_status} |`)
}

const out = lines.join('\n') + '\n'
fs.writeFileSync('docs/skill-desc-review.md', out)
console.log('書き出し完了: docs/skill-desc-review.md')
console.log(`スキル数: ${skills.length}, 駒数（skill持ち）: ${pieces.length}`)
