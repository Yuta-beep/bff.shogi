import type { AiMoveRequest } from '@/lib/ai-engine-contract';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PieceMappingService } from '@/services/piece-mapping';

type PieceSkillRow = {
  piece_id: number;
  skill_id: number | null;
};

type SkillMetaRow = {
  skill_id: number;
  skill_desc: string;
  implementation_kind: string | null;
  trigger_group: string | null;
  trigger_type: string | null;
  source_kind: string | null;
  source_file: string | null;
  source_function: string | null;
  tags_json: unknown;
  script_hook: string | null;
};

type SkillConditionRow = {
  skill_id: number;
  condition_order: number;
  condition_group: string;
  condition_type: string;
  params_json: Record<string, unknown> | null;
  is_active: boolean;
};

type SkillEffectV2Row = {
  skill_id: number;
  effect_order: number;
  effect_group: string | null;
  effect_type: string;
  target_group: string | null;
  target_selector: string | null;
  params_json: Record<string, unknown> | null;
  is_active: boolean;
};

type SkillEffectReadyRow = SkillEffectV2Row & {
  effect_group: string;
  target_group: string;
  target_selector: string;
};

type LegacySkillEffectRow = {
  skill_id: number;
  effect_order: number;
  effect_type: string;
  target_rule: string;
  trigger_timing: string | null;
  proc_chance: number | null;
  duration_turns: number | null;
  value_num: number | null;
  value_text: string | null;
  params_json: Record<string, unknown> | null;
  is_active: boolean;
};

type SkillRegistryGroupRow = {
  schema_kind: string;
  group_code: string;
  group_name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

type SkillRegistryOptionRow = {
  schema_kind: string;
  group_code: string;
  option_code: string;
  option_name: string;
  description: string | null;
  value_type: string | null;
  sort_order: number;
  is_script_only: boolean;
  is_active: boolean;
};

type SkillImplementationKindRow = {
  implementation_kind: string;
  display_name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
};

type SkillRegistryDocument = {
  version: string;
  updatedAt: string;
  implementationKinds: Array<{
    code: string;
    name: string;
    description: string;
  }>;
  registries: Record<
    string,
    {
      groups: Array<{
        groupCode: string;
        groupName: string;
        description: string;
        options: Array<{
          optionCode: string;
          optionName: string;
          description: string;
          valueType?: string;
        }>;
      }>;
    }
  >;
};

type SkillConditionDocument = {
  order: number;
  group: string;
  type: string;
  params: Record<string, unknown>;
};

type SkillEffectDocument = {
  order: number;
  group: string;
  type: string;
  target: {
    group: string;
    selector: string;
  };
  params: Record<string, unknown>;
};

type SkillDefinitionEntry = {
  skillId: number;
  pieceChars: string[];
  source: {
    skillText: string;
    sourceKind: string;
    sourceFile: string;
    sourceFunction: string;
  };
  classification: {
    implementationKind: string;
    tags: string[];
  };
  trigger: {
    group: string;
    type: string;
  };
  conditions: SkillConditionDocument[];
  effects: SkillEffectDocument[];
  scriptHook: string | null;
  notes: string | null;
};

type SkillDefinitionDocument = {
  version: string;
  updatedAt: string;
  sourceOfTruth: Array<{
    pieceChar: string;
    skillText: string;
    sourceFile: string;
    sourceFunction: string;
  }>;
  definitions: SkillDefinitionEntry[];
};

type SkillPayload = {
  registry: SkillRegistryDocument | null;
  definitions: SkillDefinitionDocument | null;
  legacyEffects: Record<string, unknown>[];
};

type SkillQueryClient = {
  schema: (schema: string) => {
    from: (table: string) => any;
  };
};

let skillRegistryV2Promise: Promise<SkillRegistryDocument> | null = null;

export async function attachSkillEffectsToAiRequest(
  input: AiMoveRequest,
  mappingService?: PieceMappingService,
): Promise<AiMoveRequest> {
  const resolvedMappingService = mappingService ?? (await PieceMappingService.fromDb());
  return attachSkillEffectsToAiRequestWithClient(
    input,
    supabaseAdmin,
    true,
    resolvedMappingService,
  );
}

export async function attachSkillEffectsToAiRequestWithClient(
  input: AiMoveRequest,
  client: SkillQueryClient,
  useRegistryCache = false,
  mappingService: PieceMappingService,
): Promise<AiMoveRequest> {
  const pieceCodes = collectPieceCodesForSkillLookup(input.position, mappingService);
  if (pieceCodes.size === 0) {
    return withSkillPayload(input, {
      registry: null,
      definitions: null,
      legacyEffects: [],
    });
  }

  const displayCharToPieceId = mappingService.resolveDisplayCharsToPieceIds(pieceCodes);
  const pieceIds = Array.from(displayCharToPieceId.values());
  const pieceIdToDisplayChar = new Map(
    [...displayCharToPieceId.entries()].map(([displayChar, id]) => [id, displayChar]),
  );

  if (pieceIds.length === 0) {
    return withSkillPayload(input, {
      registry: null,
      definitions: null,
      legacyEffects: [],
    });
  }

  const { data: pieceRows, error: pieceError } = await client
    .schema('master')
    .from('m_piece')
    .select('piece_id,skill_id')
    .eq('is_active', true)
    .in('piece_id', pieceIds);
  if (pieceError) throw pieceError;

  const skillToPieceCodes = new Map<number, string[]>();
  for (const row of (pieceRows ?? []) as PieceSkillRow[]) {
    if (!row.skill_id) continue;
    const displayChar = pieceIdToDisplayChar.get(row.piece_id);
    if (!displayChar) continue;
    const list = skillToPieceCodes.get(row.skill_id) ?? [];
    if (!list.includes(displayChar)) list.push(displayChar);
    skillToPieceCodes.set(row.skill_id, list);
  }

  const skillIds = Array.from(skillToPieceCodes.keys());
  if (skillIds.length === 0) {
    return withSkillPayload(input, {
      registry: null,
      definitions: null,
      legacyEffects: [],
    });
  }

  const { data: skillRows, error: skillError } = await client
    .schema('master')
    .from('m_skill')
    .select(
      'skill_id,skill_desc,implementation_kind,trigger_group,trigger_type,source_kind,source_file,source_function,tags_json,script_hook',
    )
    .in('skill_id', skillIds)
    .order('skill_id', { ascending: true });
  if (skillError) throw skillError;

  const skillMetaRows = (skillRows ?? []) as SkillMetaRow[];
  const v2SkillRows = skillMetaRows.filter(isSkillV2Ready);
  const v2SkillIdSet = new Set(v2SkillRows.map((row) => row.skill_id));
  const legacySkillIds = skillIds.filter((skillId) => !v2SkillIdSet.has(skillId));

  let registry: SkillRegistryDocument | null = null;
  let definitions: SkillDefinitionDocument | null = null;

  if (v2SkillRows.length > 0) {
    const { data: conditionRows, error: conditionError } = await client
      .schema('master')
      .from('m_skill_condition')
      .select('skill_id,condition_order,condition_group,condition_type,params_json,is_active')
      .eq('is_active', true)
      .in('skill_id', Array.from(v2SkillIdSet))
      .order('skill_id', { ascending: true })
      .order('condition_order', { ascending: true });
    if (conditionError) throw conditionError;

    const { data: effectRows, error: effectError } = await client
      .schema('master')
      .from('m_skill_effect')
      .select(
        'skill_id,effect_order,effect_group,effect_type,target_group,target_selector,params_json,is_active',
      )
      .eq('is_active', true)
      .in('skill_id', Array.from(v2SkillIdSet))
      .order('skill_id', { ascending: true })
      .order('effect_order', { ascending: true });
    if (effectError) throw effectError;

    registry = await loadSkillRegistryV2(client, useRegistryCache);
    definitions = buildSkillDefinitionDocument(
      v2SkillRows,
      skillToPieceCodes,
      (conditionRows ?? []) as SkillConditionRow[],
      (effectRows ?? []) as SkillEffectV2Row[],
    );
  }

  const legacyEffects =
    legacySkillIds.length > 0
      ? await loadLegacySkillEffects(client, legacySkillIds, skillToPieceCodes)
      : [];

  return withSkillPayload(input, {
    registry,
    definitions,
    legacyEffects,
  });
}

async function loadLegacySkillEffects(
  client: SkillQueryClient,
  skillIds: number[],
  skillToPieceCodes: Map<number, string[]>,
): Promise<Record<string, unknown>[]> {
  const { data: effectRows, error: effectError } = await client
    .schema('master')
    .from('m_skill_effect')
    .select(
      'skill_id,effect_order,effect_type,target_rule,trigger_timing,proc_chance,duration_turns,value_num,value_text,params_json,is_active',
    )
    .eq('is_active', true)
    .in('skill_id', skillIds)
    .order('skill_id', { ascending: true })
    .order('effect_order', { ascending: true });
  if (effectError) throw effectError;

  return ((effectRows ?? []) as LegacySkillEffectRow[]).flatMap((row) => {
    const pieces = skillToPieceCodes.get(row.skill_id) ?? [];
    return pieces.map((pieceCode) => ({
      skill_id: row.skill_id,
      effect_order: row.effect_order,
      effect_type: row.effect_type,
      target_rule: row.target_rule,
      trigger_timing: row.trigger_timing,
      proc_chance: row.proc_chance,
      duration_turns: row.duration_turns,
      value_num: row.value_num,
      value_text: row.value_text,
      params_json: row.params_json ?? {},
      is_active: row.is_active,
      piece_code: pieceCode,
      source_piece_code: pieceCode,
    }));
  });
}

async function loadSkillRegistryV2(
  client: SkillQueryClient,
  useCache: boolean,
): Promise<SkillRegistryDocument> {
  if (!useCache) {
    return await fetchSkillRegistryV2(client);
  }
  if (!skillRegistryV2Promise) {
    skillRegistryV2Promise = fetchSkillRegistryV2(client);
  }
  return await skillRegistryV2Promise;
}

async function fetchSkillRegistryV2(client: SkillQueryClient): Promise<SkillRegistryDocument> {
  const [kindRes, groupRes, optionRes] = await Promise.all([
    client
      .schema('master')
      .from('m_skill_implementation_kind')
      .select('implementation_kind,display_name,description,sort_order,is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    client
      .schema('master')
      .from('m_skill_schema_group')
      .select('schema_kind,group_code,group_name,description,sort_order,is_active')
      .eq('is_active', true)
      .order('schema_kind', { ascending: true })
      .order('sort_order', { ascending: true }),
    client
      .schema('master')
      .from('m_skill_schema_option')
      .select(
        'schema_kind,group_code,option_code,option_name,description,value_type,sort_order,is_script_only,is_active',
      )
      .eq('is_active', true)
      .order('schema_kind', { ascending: true })
      .order('group_code', { ascending: true })
      .order('sort_order', { ascending: true }),
  ]);

  if (kindRes.error) throw kindRes.error;
  if (groupRes.error) throw groupRes.error;
  if (optionRes.error) throw optionRes.error;

  return buildSkillRegistryV2Document(
    (kindRes.data ?? []) as SkillImplementationKindRow[],
    (groupRes.data ?? []) as SkillRegistryGroupRow[],
    (optionRes.data ?? []) as SkillRegistryOptionRow[],
  );
}

export function resetSkillRegistryV2CacheForTests() {
  skillRegistryV2Promise = null;
}

function withSkillPayload(input: AiMoveRequest, payload: SkillPayload): AiMoveRequest {
  const skillsEnabled =
    (payload.definitions?.definitions.length ?? 0) > 0 || payload.legacyEffects.length > 0;
  const boardState: Record<string, unknown> = {
    ...input.position.boardState,
    skills_enabled: skillsEnabled,
    skill_effects: payload.legacyEffects,
  };

  if (payload.registry && payload.definitions) {
    boardState.skill_registry_v2 = payload.registry;
    boardState.skill_definitions_v2 = payload.definitions;
  }

  return {
    ...input,
    position: {
      ...input.position,
      boardState,
    },
  };
}

export function buildSkillRegistryV2Document(
  implementationKinds: SkillImplementationKindRow[],
  groups: SkillRegistryGroupRow[],
  options: SkillRegistryOptionRow[],
): SkillRegistryDocument {
  const groupsBySchema = new Map<
    string,
    Array<{
      groupCode: string;
      groupName: string;
      description: string;
      options: Array<{
        optionCode: string;
        optionName: string;
        description: string;
        valueType?: string;
      }>;
    }>
  >();

  for (const group of groups) {
    const optionItems = options
      .filter(
        (option) =>
          option.schema_kind === group.schema_kind && option.group_code === group.group_code,
      )
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((option) => ({
        optionCode: option.option_code,
        optionName: option.option_name,
        description: option.description ?? '',
        ...(option.value_type ? { valueType: option.value_type } : {}),
      }));
    const list = groupsBySchema.get(group.schema_kind) ?? [];
    list.push({
      groupCode: group.group_code,
      groupName: group.group_name,
      description: group.description ?? '',
      options: optionItems,
    });
    groupsBySchema.set(group.schema_kind, list);
  }

  return {
    version: 'skill-registry-v2-db',
    updatedAt: new Date().toISOString(),
    implementationKinds: implementationKinds
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((kind) => ({
        code: kind.implementation_kind,
        name: kind.display_name,
        description: kind.description,
      })),
    registries: {
      trigger: { groups: groupsBySchema.get('trigger') ?? [] },
      target: { groups: groupsBySchema.get('target') ?? [] },
      effect: { groups: groupsBySchema.get('effect') ?? [] },
      condition: { groups: groupsBySchema.get('condition') ?? [] },
      param: { groups: groupsBySchema.get('param') ?? [] },
    },
  };
}

export function buildSkillDefinitionDocument(
  skillRows: SkillMetaRow[],
  skillToPieceCodes: Map<number, string[]>,
  conditionRows: SkillConditionRow[],
  effectRows: SkillEffectV2Row[],
): SkillDefinitionDocument {
  const conditionsBySkill = new Map<number, SkillConditionRow[]>();
  for (const row of conditionRows) {
    const list = conditionsBySkill.get(row.skill_id) ?? [];
    list.push(row);
    conditionsBySkill.set(row.skill_id, list);
  }

  const effectsBySkill = new Map<number, SkillEffectV2Row[]>();
  for (const row of effectRows) {
    const list = effectsBySkill.get(row.skill_id) ?? [];
    list.push(row);
    effectsBySkill.set(row.skill_id, list);
  }

  const definitions = skillRows.map((row) => ({
    skillId: row.skill_id,
    pieceChars: skillToPieceCodes.get(row.skill_id) ?? [],
    source: {
      skillText: row.skill_desc,
      sourceKind: normalizeSourceKind(row.source_kind),
      sourceFile: row.source_file ?? '',
      sourceFunction: row.source_function ?? '',
    },
    classification: {
      implementationKind: row.implementation_kind ?? 'script_hook',
      tags: normalizeTagList(row.tags_json),
    },
    trigger: {
      group: row.trigger_group ?? 'special',
      type: row.trigger_type ?? 'script_hook',
    },
    conditions: (conditionsBySkill.get(row.skill_id) ?? [])
      .sort((a, b) => a.condition_order - b.condition_order)
      .map((condition) => ({
        order: condition.condition_order,
        group: condition.condition_group,
        type: condition.condition_type,
        params: condition.params_json ?? {},
      })),
    effects: (effectsBySkill.get(row.skill_id) ?? [])
      .filter(isSkillEffectReadyRow)
      .sort((a, b) => a.effect_order - b.effect_order)
      .map((effect) => ({
        order: effect.effect_order,
        group: effect.effect_group,
        type: effect.effect_type,
        target: {
          group: effect.target_group,
          selector: effect.target_selector,
        },
        params: effect.params_json ?? {},
      })),
    scriptHook: row.script_hook,
    notes: null,
  }));

  const sourceOfTruth = definitions.flatMap((definition) =>
    definition.pieceChars.map((pieceChar) => ({
      pieceChar,
      skillText: String(definition.source.skillText ?? ''),
      sourceFile: String(definition.source.sourceFile ?? ''),
      sourceFunction: String(definition.source.sourceFunction ?? ''),
    })),
  );

  return {
    version: 'skill-definition-v2-db',
    updatedAt: new Date().toISOString(),
    sourceOfTruth,
    definitions,
  };
}

function isSkillV2Ready(row: SkillMetaRow): boolean {
  return Boolean(row.implementation_kind && row.trigger_group && row.trigger_type);
}

function normalizeSourceKind(value: string | null): string {
  switch (value) {
    case 'piece_info':
    case 'deck_builder':
    case 'online_battle':
    case 'manual':
      return value;
    default:
      return 'manual';
  }
}

function normalizeTagList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function isSkillEffectReadyRow(effect: SkillEffectV2Row): effect is SkillEffectReadyRow {
  return Boolean(effect.effect_group && effect.target_group && effect.target_selector);
}

export function collectPieceCodesForSkillLookup(
  position: AiMoveRequest['position'],
  mappingService: PieceMappingService,
): Set<string> {
  const set = new Set<string>();

  for (const code of extractPieceCodesFromSfen(position.sfen ?? null, mappingService))
    set.add(code);
  for (const code of extractPieceCodesFromHands(position.hands)) set.add(code);
  for (const mv of position.legalMoves) {
    if (mv.pieceCode) set.add(mv.pieceCode.toUpperCase());
    if (mv.dropPieceCode) set.add(mv.dropPieceCode.toUpperCase());
  }

  return set;
}

function extractPieceCodesFromHands(hands: unknown): Set<string> {
  const out = new Set<string>();
  if (!hands || typeof hands !== 'object') return out;
  for (const sideHands of Object.values(hands as Record<string, unknown>)) {
    if (!sideHands || typeof sideHands !== 'object') continue;
    for (const [pieceCode, count] of Object.entries(sideHands as Record<string, unknown>)) {
      if (typeof count === 'number' && count > 0) {
        out.add(pieceCode.toUpperCase());
      }
    }
  }
  return out;
}

export function extractPieceCodesFromSfen(
  sfen: string | null,
  mappingService: PieceMappingService,
): Set<string> {
  return mappingService.extractDisplayCharsFromSfen(sfen);
}
