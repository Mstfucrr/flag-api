import type { FlagConditionRow } from './types/flag.types';

/**
 * Request-log kayıtlarında `resourceId` alanı için sabit URI üretir.
 * Aynı proje altındaki tüm flag işlemleri bu id ile gruplanır.
 */
export function projectFlagsResourceId(projectKey: string): string {
  return `/feature-flags/projects/${projectKey.trim()}`;
}

/**
 * Kuralları kararlı (canonical) bir JSON string’e çevirir: koşul ve filtre sırası
 * normalize edilir; böylece aynı anlamsal içerik farklı sıralamada gelse bile
 * eşitlik karşılaştırması tutarlı olur (`update` içinde `rulesChanged` için).
 */
export function canonicalRulesJson(rules: FlagConditionRow[]): string {
  const clone = structuredClone(rules);
  clone.sort((a, b) => a.id.localeCompare(b.id));
  for (const c of clone) {
    c.filters = [...c.filters].sort((a, b) =>
      (a.id ?? '').localeCompare(b.id ?? ''),
    );
  }
  return JSON.stringify(clone);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Verilen alan anahtarları için `before` / `after` kayıtlarını karşılaştırır;
 * sadece değişen alanları `oldData` ve `newData` içinde döndürür (audit / request log).
 */
export function diffChangedFields<K extends string>(
  keys: readonly K[],
  before: Record<K, unknown>,
  after: Record<K, unknown>,
): {
  oldData: Partial<Record<K, unknown>>;
  newData: Partial<Record<K, unknown>>;
} {
  const oldData: Partial<Record<K, unknown>> = {};
  const newData: Partial<Record<K, unknown>> = {};
  for (const k of keys) {
    if (!jsonEqual(before[k], after[k])) {
      oldData[k] = before[k];
      newData[k] = after[k];
    }
  }
  return { oldData, newData };
}
