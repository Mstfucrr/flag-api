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
| `REDIS_*`                  | Hayır         | Redis tabanlı runtime snapshot önbelleği.                                                                                                                                                                          |
| `THROTTLER_TTL`            | Hayır         | Genel HTTP rate limit penceresi (ms); varsayılan `60000`.                                                                                                                                                          |
| `THROTTLER_LIMIT`          | Hayır         | Genel HTTP istek limiti; varsayılan `1000`. Admin controller'ları `300/60000 ms` kullanır.                                                                                                                         |
| `LOG_LEVEL`                | Hayır         | Virgülle ayrılmış NestJS log seviyeleri; ör. `error,warn,log`.                                                                                                                                                     |
| `ENABLE_METRICS`           | Hayır         | `TRUE` olduğunda Instana collector başlatılır.                                                                                                                                                                     |
| `INSTANA_*`                | Hayır         | Instana host, port, level ve servis adı ayarları.                                                                                                                                                                  |
| **`FLAGS_API_KEY`**        | Hayır         | **Doluysa** runtime ve admin flag endpoint'leri `Authorization: Bearer <değer>` bekler; timing-safe karşılaştırma kullanılır. **Boş bırakılırsa** bu endpoint'lerde kimlik doğrulama uygulanmaz. |

Üretimde `FLAGS_API_KEY` tanımlayıp runtime client'ta aynı değeri SDK `apiKey` veya `getHeaders` ile göndermeniz önerilir.

Rate limit aşıldığında `429` ve `{ "error": "RATE_LIMIT_EXCEEDED", "message": "..." }` döner. Geçerli JWT Bearer içindeki `sub` kullanıcı tracker'ı olarak kullanılır; aksi halde istemci IP'si kullanılır. Genel HTTP limiter in-memory ve API instance'ı bazlıdır; iş cooldown'ları gerektiğinde ayrıca Redis TTL ile uygulanır.

## Loglama ve observability

- Operasyonel loglar NestJS `Logger` ile yazılır; token, parola, OTP, request body ve tam PII loglanmaz.
- Seçili kritik HTTP istekleri ve başarılı kritik mutasyonlar tek satır `audit: true` JSON stdout kaydı üretir.
- Instana yalnızca `ENABLE_METRICS=TRUE` iken trace/metrik için başlatılır; uygulama loglarının yerine geçmez.

## Kimlik doğrulama (`FLAGS_API_KEY`)

- Guard: `FlagsApiKeyGuard` — `FlagsSdkController` ve `FlagsAdminController` üzerinde.
- İstemci: `@core-sdk/feature-flags-sdk` içinde `apiKey` doluysa `Authorization: Bearer` otomatik eklenir; boşsa başlık gönderilmez (`getHeaders` ile özelleştirilebilir).

> **Not:** `ProjectsController` içindeki `ProjectsAdminGuard` şu an yer tutucudur. `RequestLogController` üzerinde de API key guard bulunmaz. Bu endpoint'ler production entegrasyonunda ayrıca korunmalıdır.

## Testler

```bash
pnpm run test        # birim testleri
pnpm run test:e2e    # uygulama e2e
pnpm run test:cov    # coverage
```

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
