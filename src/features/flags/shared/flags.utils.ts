import type { FlagConditionRow } from './types/flag.types';

/**
 * Request-log’da aynı projenin flag işlemlerini gruplayan URI.
 *
 * @param projectKey - Proje anahtarı
 * @returns `/feature-flags/projects/{key}`
 *
 * @example
 * ```ts
 * projectFlagsResourceId('portal')
 * // '/feature-flags/projects/portal'
 * ```
 */
export function projectFlagsResourceId(projectKey: string): string {
    return `/feature-flags/projects/${projectKey.trim()}`;
}

let lastFreshTimestampMs = 0;

/**
 * Çakışmasız ISO `updatedAt` üretir (aynı milisaniye içindeki yazımlar için).
 *
 * @returns Artan ISO string
 *
 * @example
 * ```ts
 * freshTimestamp()
 * // '2026-09-20T11:58:00.001Z'
 * ```
 */
export function freshTimestamp(): string {
    const now = Date.now();
    lastFreshTimestampMs = now > lastFreshTimestampMs ? now : lastFreshTimestampMs + 1;
    return new Date(lastFreshTimestampMs).toISOString();
}

/**
 * Kuralları sıra-bağımsız karşılaştırılabilir JSON’a çevirir.
 *
 * @param rules - Koşul listesi
 * @returns Canonical JSON string (`rulesChanged` karşılaştırması için)
 *
 * @example
 * ```ts
 * canonicalRulesJson([{ id: 'staff', active: true, filters: [] }])
 * ```
 */
export function canonicalRulesJson(rules: FlagConditionRow[]): string {
    return JSON.stringify(
        [...rules]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((condition) => ({
                id: condition.id,
                active: condition.active !== false,
                filters: [...condition.filters]
                    .sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
                    .map((filter) => ({
                        id: filter.id,
                        field: filter.field,
                        operator: filter.operator,
                        value: filter.value,
                    })),
            })),
    );
}

function jsonEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Audit için sadece değişen alanları ayırır.
 *
 * @param keys - Karşılaştırılacak alan adları
 * @param before - Eski değerler
 * @param after - Yeni değerler
 * @returns `{ oldData, newData }` — değişmeyen alanlar yok
 *
 * @example
 * ```ts
 * diffChangedFields(['enabled'], { enabled: true }, { enabled: false })
 * // { oldData: { enabled: true }, newData: { enabled: false } }
 * ```
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
