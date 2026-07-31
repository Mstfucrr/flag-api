# feature-flag-api

NestJS tabanlı **özellik bayrağı (feature flag)** HTTP servisi. Projeler ve bayraklar PostgreSQL’de tutulur; bildirimsel kurallarla değerlendirme, doğrusal sürümleme, geçmiş ve yönetim uçları sunar. İstemci tarafında `@core-sdk/feature-flags-sdk` ile eşleşecek şekilde tasarlanmıştır.

## Özellikler

| Alan                   | Açıklama                                                                        |
| ---------------------- | ------------------------------------------------------------------------------- |
| **Projeler**           | Admin: proje oluşturma, listeleme, silme (`/admin/projects`).                   |
| **Runtime bayraklar**  | SDK: liste, tekil okuma, toplu `POST …/flags/evaluate` ile karar.               |
| **Admin bayraklar**    | Oluşturma, güncelleme, aç/kapa, silme, geçmiş, sürüm anlık görüntüsü, rollback. |
| **Önbellek**           | İsteğe bağlı Redis ile runtime değerlendirme anlık görüntüsü.                   |
| **Trafik koruması**    | `@nestjs/throttler` ile controller bazlı HTTP rate limit.                       |
| **Gözlemlenebilirlik** | NestJS Logger, JSON audit stdout, opsiyonel Instana ve Swagger.                 |

## Mimari özeti

- **Runtime uçları** (`FlagsSdkController`): `GET/POST` altında `/projects/:projectKey/flags/…` — istemci SDK’nın varsayılan yolları.
- **Admin uçları** (`FlagsAdminController`): `/admin/projects/:projectKey/flags/…` — portal veya iç araçlar; geçmiş ve sürüm detayı yalnızca burada.
- **Çekirdek değerlendirme**: `@core-sdk/feature-flags-core` ile aynı kural modeli (koşullar OR, filtreler AND).

## Gereksinimler

- Node.js 18+
- pnpm
- PostgreSQL
- İsteğe bağlı: Redis (runtime önbellek için)

## Kurulum ve çalıştırma

```bash
pnpm install
```

Geliştirme (izleme modu):

```bash
pnpm run start:dev
```

Üretim derlemesi ve çalıştırma:

```bash
pnpm run build
pnpm run start:prod
```

Varsayılan HTTP portu **3001** (`PORT` ile değiştirilebilir). Swagger: `http://localhost:3001/docs`.

## Health check

`GET /health`, servis uptime bilgisini ve PostgreSQL/Redis durumunu döner. PostgreSQL kapalıysa `503`; opsiyonel Redis kapalıysa DB fallback devam ettiği için `200 degraded` döner.

## Ortam değişkenleri

Örnek dosya: [`.env.example`](.env.example). Özet:

| Değişken                   | Zorunlu       | Açıklama                                                                                                                                                                                                           |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`                     | Hayır         | HTTP portu (varsayılan `3001`).                                                                                                                                                                                    |
| `DATABASE_URL` veya `DB_*` | Evet (üretim) | PostgreSQL bağlantısı.                                                                                                                                                                                             |
| `DB_SYNC`                  | Hayır         | `true` iken şema entity’lerden senkron (yalnızca geliştirme).                                                                                                                                                      |
| `DB_POOL_MAX`              | Hayır         | Postgres bağlantı havuzu boyutu; varsayılan `20`. `instance_sayısı × bu değer`, Postgres `max_connections`'ı aşmamalı.                                                                                             |
| `DB_POOL_CONNECTION_TIMEOUT_MS` | Hayır    | Havuzda boş bağlantı yoksa ne kadar beklenip sonra hata verileceği (ms); varsayılan `5000`. `pg` varsayılanı `0` (sınırsız bekleme) olduğu için kasıtlı override.                                                  |
| `REDIS_*`                  | Hayır         | Redis tabanlı runtime snapshot önbelleği.                                                                                                                                                                          |
| `THROTTLER_TTL`            | Hayır         | Genel HTTP rate limit penceresi (ms); varsayılan `60000`.                                                                                                                                                          |
| `THROTTLER_LIMIT`          | Hayır         | Genel HTTP istek limiti; varsayılan `1000`. Admin controller'ları `300/60000 ms` kullanır.                                                                                                                         |
| `LOG_LEVEL`                | Hayır         | Virgülle ayrılmış NestJS log seviyeleri; ör. `error,warn,log`.                                                                                                                                                     |
| `ENABLE_METRICS`           | Hayır         | `TRUE` olduğunda Instana collector başlatılır.                                                                                                                                                                     |
| `INSTANA_*`                | Hayır         | Instana host, port, level ve servis adı ayarları.                                                                                                                                                                  |
| **`FLAGS_API_KEY`**        | **Evet**      | Runtime ve admin flag endpoint'leri `Authorization: Bearer <değer>` bekler; timing-safe karşılaştırma kullanılır. Boş bırakılırsa süreç **başlamaz** (bkz. `main.ts` bootstrap kontrolü). |

`FLAGS_API_KEY` ile aynı değeri runtime client'ta SDK `apiKey` veya `getHeaders` ile göndermeniz gerekir.

Rate limit aşıldığında `429` ve `{ "error": "RATE_LIMIT_EXCEEDED", "message": "..." }` döner. Geçerli JWT Bearer içindeki `sub` kullanıcı tracker'ı olarak kullanılır; aksi halde istemci IP'si kullanılır. Genel HTTP limiter in-memory ve API instance'ı bazlıdır; iş cooldown'ları gerektiğinde ayrıca Redis TTL ile uygulanır.

## Loglama ve observability

- Operasyonel loglar NestJS `Logger` ile yazılır; token, parola, OTP, request body ve tam PII loglanmaz.
- Seçili kritik HTTP istekleri ve başarılı kritik mutasyonlar tek satır `audit: true` JSON stdout kaydı üretir.
- Instana yalnızca `ENABLE_METRICS=TRUE` iken trace/metrik için başlatılır; uygulama loglarının yerine geçmez.

## Kimlik doğrulama (`FLAGS_API_KEY`)

- Guard: `FlagsApiKeyGuard` — `FlagsSdkController` ve `FlagsAdminController` üzerinde, **zorunlu**. `FLAGS_API_KEY` tanımlı değilse süreç başlamaz.
- İstemci: `@core-sdk/feature-flags-sdk` içinde `apiKey` doluysa `Authorization: Bearer` otomatik eklenir (`getHeaders` ile özelleştirilebilir).

> **Not:** `ProjectsController` (`admin/projects`) ve `RequestLogController` (`admin/request-logs`) kasıtlı olarak `FlagsApiKeyGuard` kullanmaz — bu uçların korunması ağ katmanına (ayrı bir API Gateway arkasında, dışarıya kapalı) bırakılmıştır. `ProjectsAdminGuard` bu nedenle bilinçli bir placeholder'dır; bu varsayım geçerliliğini yitirirse (ör. servis gateway olmadan expose edilirse) burada gerçek bir auth guard'a ihtiyaç duyulur.

## Testler

```bash
pnpm run test        # birim testleri
pnpm run test:e2e    # uygulama e2e
pnpm run test:cov    # coverage
```

## Şema / migration

Prod'da (ve `DB_SYNC=false` olan her ortamda) şema **migration** ile yönetilir,
auto-sync ile değil:

```bash
npm run migration:generate -- src/database/migrations/Açıklayıcıİsim  # entity değişince
npm run migration:run                                                 # uygula
npm run migration:revert                                              # bir öncekine dön
```

Migration'lar deploy pipeline'ının açık bir adımı olarak çalıştırılmalı (build → migration:run →
uygulamayı başlat) — uygulamanın kendisi boot'ta migration çalıştırmaz. Çoklu instance aynı anda
ayağa kalktığında migration'ların yarışmasını engelleyen bir kilit yok; bu yüzden migration'ı
her zaman **tek** bir adımda, yeni instance'lar başlamadan önce çalıştırın.

Local geliştirmede `DB_SYNC=true` (`.env.example`) kullanmaya devam edebilirsiniz — migration
gerekmez.

## Bayrak `rules` modeli

Her kural satırı bir **koşul** (`id`, `active`, `filters`). Koşullar değerlendirmede **VEYA**; aynı koşuldaki filtreler **VE**. Filtre: `field`, `operator`, `value`. Sistem tek kural formatı kullanır.

Çekirdek değerlendirme paketi: **`@core-sdk/feature-flags-core`** — bağımlılık `package.json` içinde tanımlıdır; `pnpm install` ile çözülür.

## SDK ile uç eşlemesi

| SDK / istemci            | HTTP                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `bootstrap`, liste       | `GET /projects/:projectKey/flags`                                  |
| `isEnabled`, `prefetch…` | `POST /projects/:projectKey/flags/evaluate`                        |
| `getHistory`             | `GET /admin/projects/:projectKey/flags/:flagKey/history`           |
| `getVersionDetail`       | `GET /admin/projects/:projectKey/flags/:flagKey/versions/:version` |

## Lisans

Proje private / UNLICENSED olabilir; kurumsal politikanıza göre güncelleyin.
