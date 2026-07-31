/**
 * Ham Redis anahtarı üretmez; önek `RedisService` içindeki `redis.keyPrefix` ile eklenir.
 */

export function runtimeFlagsKey(projectKey: string): string {
    return `ff:runtime:flags:${projectKey.trim()}`;
}

export function runtimeVersionKey(projectKey: string): string {
    return `ff:runtime:version:${projectKey.trim()}`;
}
