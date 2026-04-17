/** Portal/BFF `vendor-logs` ile aynı `resourceId` sözleşmesi — BFF bu yolu proxylanabilir. */
export const FEATURE_FLAGS_AUDIT_RESOURCE_LOGS = '/feature-flags-audit/logs';

/** `/feature-flags-audit/projects/{projectKey}` — audit yanıtı yalnız bu projedeki flag kayıtlarını içerir. */
export const FEATURE_FLAGS_AUDIT_PROJECT_PREFIX =
  '/feature-flags-audit/projects/';

export function projectKeyFromAuditResourceId(
  resourceId: string,
): string | null {
  const t = resourceId.trim();
  if (!t.startsWith(FEATURE_FLAGS_AUDIT_PROJECT_PREFIX)) {
    return null;
  }
  return decodeURIComponent(t.slice(FEATURE_FLAGS_AUDIT_PROJECT_PREFIX.length));
}

export function isFeatureFlagsAuditResourceId(resourceId: string): boolean {
  const t = resourceId.trim();
  return (
    t === FEATURE_FLAGS_AUDIT_RESOURCE_LOGS ||
    t.startsWith(FEATURE_FLAGS_AUDIT_PROJECT_PREFIX)
  );
}
