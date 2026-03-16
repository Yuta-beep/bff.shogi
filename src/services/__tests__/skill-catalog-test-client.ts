import fs from 'node:fs';
import path from 'node:path';

type SkillCatalogDocument = {
  definitions: CatalogDefinition[];
};

type CatalogDefinition = {
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
    tags?: string[];
  };
  trigger: {
    group: string;
    type: string;
  };
  conditions?: Array<{
    order: number;
    group: string;
    type: string;
    params?: Record<string, unknown>;
  }>;
  effects?: Array<{
    order: number;
    group: string;
    type: string;
    target: {
      group: string;
      selector: string;
    };
    params?: Record<string, unknown>;
  }>;
  scriptHook?: string | null;
};

type SkillRegistryDocument = {
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

type FixtureTables = ReturnType<typeof buildCatalogSkillFixtures>;

let cachedFixtures: FixtureTables | null = null;

export function createCatalogBackedSupabaseAdmin() {
  const fixtures = cachedFixtures ?? buildCatalogSkillFixtures();
  cachedFixtures = fixtures;

  return {
    schema() {
      return {
        from(table: keyof FixtureTables) {
          return createFakeQuery(fixtures[table] ?? []);
        },
      };
    },
  };
}

export function buildCatalogSkillFixtures() {
  const backendRoot = process.cwd();
  const catalog = readJson<SkillCatalogDocument>(
    path.resolve(backendRoot, 'data/ability/skill_definition_v2_catalog.json'),
  );
  const registry = readJson<SkillRegistryDocument>(
    path.resolve(backendRoot, '../shogi-ai/docs/skill-registry-v2-draft.json'),
  );

  return {
    m_piece: catalog.definitions.flatMap((definition) =>
      definition.pieceChars.map((pieceChar) => ({
        piece_code: pieceChar,
        skill_id: definition.skillId,
        is_active: true,
      })),
    ),
    m_skill: catalog.definitions.map((definition) => ({
      skill_id: definition.skillId,
      skill_desc: definition.source.skillText,
      implementation_kind: definition.classification.implementationKind,
      trigger_group: definition.trigger.group,
      trigger_type: definition.trigger.type,
      source_kind: definition.source.sourceKind,
      source_file: definition.source.sourceFile,
      source_function: definition.source.sourceFunction,
      tags_json: definition.classification.tags ?? [],
      script_hook: definition.scriptHook ?? null,
    })),
    m_skill_condition: catalog.definitions.flatMap((definition) =>
      (definition.conditions ?? []).map((condition) => ({
        skill_id: definition.skillId,
        condition_order: condition.order,
        condition_group: condition.group,
        condition_type: condition.type,
        params_json: condition.params ?? {},
        is_active: true,
      })),
    ),
    m_skill_effect: catalog.definitions.flatMap((definition) =>
      (definition.effects ?? []).map((effect) => ({
        skill_id: definition.skillId,
        effect_order: effect.order,
        effect_group: effect.group,
        effect_type: effect.type,
        target_group: effect.target.group,
        target_selector: effect.target.selector,
        target_rule: 'unspecified',
        trigger_timing: definition.trigger.type === 'after_move' ? 'after_move' : null,
        params_json: effect.params ?? {},
        is_active: true,
      })),
    ),
    m_skill_implementation_kind: registry.implementationKinds.map((kind, index) => ({
      implementation_kind: kind.code,
      display_name: kind.name,
      description: kind.description,
      sort_order: index + 1,
      is_active: true,
    })),
    m_skill_schema_group: Object.entries(registry.registries).flatMap(([schemaKind, spec]) =>
      spec.groups.map((group, index) => ({
        schema_kind: schemaKind,
        group_code: group.groupCode,
        group_name: group.groupName,
        description: group.description,
        sort_order: index + 1,
        is_active: true,
      })),
    ),
    m_skill_schema_option: Object.entries(registry.registries).flatMap(([schemaKind, spec]) =>
      spec.groups.flatMap((group) =>
        group.options.map((option, index) => ({
          schema_kind: schemaKind,
          group_code: group.groupCode,
          option_code: option.optionCode,
          option_name: option.optionName,
          description: option.description,
          value_type: option.valueType ?? null,
          sort_order: index + 1,
          is_script_only: false,
          is_active: true,
        })),
      ),
    ),
  } as const;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function createFakeQuery(rows: readonly Record<string, unknown>[]) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const orderings: Array<{ column: string; ascending: boolean }> = [];

  const query = {
    select() {
      return query;
    },
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return query;
    },
    in(column: string, values: unknown[]) {
      const allowed = new Set(values);
      filters.push((row) => allowed.has(row[column]));
      return query;
    },
    order(column: string, options?: { ascending?: boolean }) {
      orderings.push({ column, ascending: options?.ascending !== false });
      return query;
    },
    then<TResult1 = { data: Record<string, unknown>[]; error: null }>(
      onfulfilled?:
        | ((value: {
            data: Record<string, unknown>[];
            error: null;
          }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: any) => any) | null,
    ) {
      let data = rows.map((row) => ({ ...row }));
      for (const filter of filters) {
        data = data.filter(filter);
      }
      for (const ordering of orderings) {
        data.sort((lhs, rhs) =>
          compareValues(lhs[ordering.column], rhs[ordering.column], ordering.ascending),
        );
      }
      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
    },
  };

  return query;
}

function compareValues(lhs: unknown, rhs: unknown, ascending: boolean) {
  if (lhs === rhs) return 0;
  if (lhs == null) return ascending ? -1 : 1;
  if (rhs == null) return ascending ? 1 : -1;
  const left = typeof lhs === 'number' ? lhs : String(lhs);
  const right = typeof rhs === 'number' ? rhs : String(rhs);
  if (left < right) return ascending ? -1 : 1;
  return ascending ? 1 : -1;
}
