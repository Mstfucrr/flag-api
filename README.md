# feature-flag-api

NestJS tabanlı **özellik bayrağı (feature flag)** HTTP servisi. Projeler ve bayraklar PostgreSQL’de tutulur; bildirimsel kurallarla değerlendirme, doğrusal sürümleme, geçmiş ve yönetim uçları sunar. İstemci tarafında `@core-sdk/feature-flags-sdk` ile eşleşecek şekilde tasarlanmıştır.

## Özellikler

| Alan | Açıklama |
|------|----------|
| **Projeler** | Admin: proje oluşturma, listeleme, silme (`/admin/projects`). |
| **Runtime bayraklar** | SDK: liste, tekil okuma, toplu `POST …/flags/evaluate` ile karar. |
| **Admin bayraklar** | Oluşturma, güncelleme, aç/kapa, silme, geçmiş, sürüm anlık görüntüsü, rollback. |
| **Önbellek** | İsteğe bağlı Redis ile runtime değerlendirme anlık görüntüsü. |
| **Gözlemlenebilirlik** | İstek günlüğü ve Swagger (`/docs`, `/docs/json`). |

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

Varsayılan HTTP portu **4000** (`PORT` ile değiştirilebilir). Swagger: `http://localhost:4000/docs`.

## Ortam değişkenleri

Örnek dosya: [`.env.example`](.env.example). Özet:

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `PORT` | Hayır | HTTP portu (varsayılan `4000`). |
| `DATABASE_URL` veya `DB_*` | Evet (üretim) | PostgreSQL bağlantısı. |
| `DB_SYNC` | Hayır | `true` iken şema entity’lerden senkron (yalnızca geliştirme). |
| `REDIS_*`, `RUNTIME_EVAL_CACHE_ENABLED` | Hayır | Redis tabanlı runtime önbellek. |
| **`FLAGS_API_KEY`** | Hayır | **Doluysa** hem runtime hem admin bayrak uçları `Authorization: Bearer <değer>` bekler; zamanlama güvenli karşılaştırma kullanılır. **Boş bırakılırsa** kimlik doğrulama uygulanmaz (yerel geliştirme ile uyumlu). |

Üretimde `FLAGS_API_KEY` tanımlayıp istemcide aynı değeri SDK `apiKey` veya `getHeaders` ile göndermeniz önerilir.

## Kimlik doğrulama (`FLAGS_API_KEY`)

- Guard: `FlagsApiKeyGuard` — `FlagsSdkController` ve `FlagsAdminController` üzerinde.
- İstemci: `@core-sdk/feature-flags-sdk` içinde `apiKey` doluysa `Authorization: Bearer` otomatik eklenir; boşsa başlık gönderilmez (`getHeaders` ile özelleştirilebilir).

> **Not:** `ProjectsController` için ayrı `ProjectsAdminGuard` şu an yer tutucudur; prod’da admin proje uçlarını da gerçek auth ile korumayı unutmayın.

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

| SDK / istemci | HTTP |
|---------------|------|
| `bootstrap`, liste | `GET /projects/:projectKey/flags` |
| `isEnabled`, `prefetch…` | `POST /projects/:projectKey/flags/evaluate` |
| `getHistory` | `GET /admin/projects/:projectKey/flags/:flagKey/history` |
| `getVersionDetail` | `GET /admin/projects/:projectKey/flags/:flagKey/versions/:version` |

## Lisans

Proje private / UNLICENSED olabilir; kurumsal politikanıza göre güncelleyin.
