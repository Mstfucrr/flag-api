/**
 * Ham Redis anahtarı üretmez; önek `RedisService` içindeki `redis.keyPrefix` ile eklenir.
 */

/**
 * Proje snapshot Redis anahtarı (prefix ayrıca eklenir).
 *
 * @param projectKey - Proje anahtarı
 * @returns `ff:runtime:flags:{projectKey}`
 *
 * @example
 * ```ts
 * runtimeFlagsKey('portal')
 * // 'ff:runtime:flags:portal'
 * ```
 */
export function runtimeFlagsKey(projectKey: string): string {
    return `ff:runtime:flags:${projectKey.trim()}`;
}

/**
 * Snapshot versiyon sayacı anahtarı.
 *
 * @param projectKey - Proje anahtarı
 * @returns `ff:runtime:version:{projectKey}`
 *
 * @example
 * ```ts
 * runtimeVersionKey('portal')
 * // 'ff:runtime:version:portal'
 * ```
 */
export function runtimeVersionKey(projectKey: string): string {
    return `ff:runtime:version:${projectKey.trim()}`;
}
