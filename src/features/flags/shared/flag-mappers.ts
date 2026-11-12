import { evaluateFlag } from '@core-sdk/feature-flags-core';
import type { FlagAggregate } from '../../../repository/flags/flags-persistence.repository';
import type { FlagSnapshotModel } from '../../../repository/flags/models/flag-snapshot.model';
import type { FlagConditionRow } from './types/flag.types';

/** SDK yanıtı; kural sızdırmaz. */
export function toRuntime(agg: FlagAggregate) {
    return {
        key: agg.key,
    };
}

/** Admin yanıtı: proje, kurallar, versiyon, zaman (versions[] yok). */
export function toAdminCurrent(agg: FlagAggregate) {
    return {
        projectKey: agg.projectKey,
        key: agg.key,
        description: agg.description,
        enabled: agg.enabled,
        rules: structuredClone(agg.rules),
        currentVersion: agg.currentVersion,
        updatedAt: agg.updatedAt,
    };
}

/** Versiyon satırına yazılacak anlık kopya. */
export function buildSnapshot(p: {
    key: string;
    description: string;
    enabled: boolean;
    rules: FlagConditionRow[];
}): FlagSnapshotModel {
    return {
        key: p.key,
        description: p.description,
        enabled: p.enabled,
        rules: structuredClone(p.rules),
    };
}

export function deepCloneSnapshot(s: FlagSnapshotModel): FlagSnapshotModel {
    return structuredClone(s);
}

/**
 * Core kural motoru. Kapalı master veya eşleşmeyen kuralda `false`.
 *
 * @param flagKey - Kayıtlı flag anahtarı; `percentage` operatörünün hash tuzudur, bu yüzden her
 * çağrıda (tek ve toplu evaluate) geçirilmelidir. Yayındaki bir flag'in anahtarı değişmemelidir.
 */
export function evaluateRuntimeEnabled(
    flagKey: string,
    masterEnabled: boolean,
    rules: FlagConditionRow[],
    context: Record<string, unknown>,
): boolean {
    return evaluateFlag(
        {
            key: flagKey,
            enabled: masterEnabled,
            rules,
        },
        context,
    ).enabled;
}
