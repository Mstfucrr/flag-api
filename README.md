# Feature Flag API

NestJS tabanlı **özellik bayrağı (feature flag)** HTTP servisi. Projeler ve bayraklar PostgreSQL'de tutulur; bildirimsel kurallarla değerlendirme, doğrusal sürümleme, geçmiş ve yönetim uçları sunar. İstemci tarafında `@core-sdk/feature-flags-sdk` ile eşleşecek şekilde tasarlanmıştır.

**Service name:** `feature-flag-api`
**Global API prefix:** yok — uçlar kök path'lerde (`/projects/...`, `/admin/...`, `/health`); mevcut SDK istemcileri bu path'lere sabit bağlı olduğu için sonradan prefix eklemek breaking change olur (bkz. [Mimari istisnalar](#mimari-i̇stisnalar)).
**Owner:** Feature Flags ekibi

---

## Prerequisites

- **Node.js** 22.x veya üzeri
- **pnpm** (paket yöneticisi)
- **Docker** ve **Docker Compose** (local altyapı için: PostgreSQL, Redis)

---

## Getting started

```bash
# Bağımlılıkları kur
pnpm install

# Ortam dosyasını kopyala (start:local zaten .env yoksa bunu yapar)
cp .env.example .env

# Local altyapıyı ayağa kaldır ve watch modunda çalıştır
pnpm run start:local
```

`pnpm run start:local` şunu yapar:

1. `.env` yoksa `.env.example`'ı kopyalar
2. Gerekli Docker servislerini başlatıp healthy olmalarını bekler
3. Uygulamayı `nest start --watch` ile başlatır

### Docker commands

```bash
pnpm run docker:up     # sadece altyapı (Postgres, Redis)
pnpm run docker:down   # altyapıyı durdur
pnpm run docker:logs   # container log'larını izle
pnpm run start:dev     # sadece uygulama (altyapı zaten ayakta olmalı)
```

> Not: Repo kökündeki `Makefile` (`make ff-infra-up` vb.) core-sdk local geliştirme akışı için ayrıca duruyor; ikisi paralel çalışır, birbirinin yerine geçmez.

### Local endpoints

| Resource   | URL                            |
| ---------- | ------------------------------ |
| API base   | `http://localhost:3001`        |
| Health     | `http://localhost:3001/health` |
| Swagger UI | `http://localhost:3001/docs`   |

---

## Project structure

```
src/
├── config/                     # Ortam değişkeni okuma (@nestjs/config tabanlı — bkz. Mimari istisnalar)
├── features/                   # Domain modülleri (controller + service + dto)
│   ├── flags/                  # Runtime + admin flag uçları, versiyon/rollback iş mantığı
│   ├── projects/               # Proje CRUD, dev-only seed
│   ├── request-log/            # Audit log sorgulama ucu
│   └── health/                 # /health
├── repository/                 # Veri/cache erişim katmanı — iş mantığı içermez
│   ├── flags/                  # TypeORM persistence + runtime cache (Redis)
│   ├── projects/
│   ├── request-log/
│   └── redis/                  # Redis bağlantısı + genel cache servisi
├── database/                   # TypeORM entity/migration/DataSource (bkz. Mimari istisnalar)
├── common/                     # Servisler arası paylaşılan alt yapı
│   ├── guards/                 # FLAGS_API_KEY guard
│   ├── throttling/             # Rate limit guard'ı
│   └── logging/                # Audit log + interceptor
├── app.module.ts
└── main.ts
```

`clients/` klasörü yok — bu serviste dış HTTP/Kafka çağrısı bulunmuyor.

### Layer responsibilities

| Layer         | Responsibility                                                            |
| ------------- | ------------------------------------------------------------------------- |
| `features/`   | HTTP controller, iş mantığı, request/response DTO'ları                    |
| `repository/` | Veritabanı ve cache erişimi — iş mantığı içermez                          |
| `common/`     | Guard, interceptor, audit logging gibi katmanlar-arası paylaşılan kod     |
| `database/`   | TypeORM entity/migration/bağlantı altyapısı (tek bir feature'a ait değil) |
| `config/`     | Ortam değişkeni okuma (`src/config/*.config.ts`)                          |

---

## Environment variables

Tam referans: [`.env.example`](.env.example).

### Application

| Variable | Required | Description                     |
| -------- | -------- | ------------------------------- |
| `PORT`   | Hayır    | HTTP portu (varsayılan `3001`). |

### PostgreSQL

| Variable                        | Required      | Description                                                                                                           |
| ------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` veya `DB_*`      | Evet (üretim) | PostgreSQL bağlantısı.                                                                                                |
| `DB_SYNC`                       | Hayır         | `true` iken şema entity'lerden senkron edilir (yalnızca local geliştirme; bkz. [Şema / migration](#şema--migration)). |
| `DB_POOL_MAX`                   | Hayır         | Bağlantı havuzu boyutu; varsayılan `20`. `instance_sayısı × bu değer`, Postgres `max_connections`'ı aşmamalı.         |
| `DB_POOL_CONNECTION_TIMEOUT_MS` | Hayır         | Havuzda boş bağlantı yoksa ne kadar beklenip hata verileceği (ms); varsayılan `5000`.                                 |

### Redis

| Variable  | Required | Description                               |
| --------- | -------- | ----------------------------------------- |
| `REDIS_*` | Hayır    | Redis tabanlı runtime snapshot önbelleği. |

### Trafik koruması / observability

| Variable            | Required | Description                                                                                 |
| ------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `THROTTLER_TTL`     | Hayır    | Genel HTTP rate limit penceresi (ms); varsayılan `60000`.                                   |
| `THROTTLER_LIMIT`   | Hayır    | Genel HTTP istek limiti; varsayılan `1000`. Admin controller'ları `300/60000ms`.            |
| `LOG_LEVEL`         | Hayır    | Virgülle ayrılmış NestJS log seviyeleri; ör. `error,warn,log`.                              |
| `ENABLE_METRICS`    | Hayır    | `TRUE` olduğunda Instana collector başlatılır.                                              |
| `INSTANA_*`         | Hayır    | Instana host/port/level/servis adı ayarları.                                                |
| **`FLAGS_API_KEY`** | **Evet** | Runtime/admin flag uçları `Authorization: Bearer <değer>` bekler. Boşsa süreç **başlamaz**. |

Rate limit aşıldığında `429` ve `{ "error": "RATE_LIMIT_EXCEEDED", "message": "..." }` döner.

---

## API overview

| Method  | Path                                                           | Description                                    |
| ------- | -------------------------------------------------------------- | ---------------------------------------------- |
| `GET`   | `/health`                                                      | Servis, PostgreSQL, Redis durumu               |
| `GET`   | `/projects/:projectKey/flags`                                  | SDK `bootstrap`/liste                          |
| `POST`  | `/projects/:projectKey/flags/evaluate`                         | SDK `isEnabled`/`prefetch…`                    |
| `POST`  | `/admin/projects`                                              | Proje oluştur                                  |
| `POST`  | `/admin/projects/:projectKey/flags`                            | Flag oluştur                                   |
| `PUT`   | `/admin/projects/:projectKey/flags/:flagKey`                   | Flag güncelle (kural değişirse versiyon artar) |
| `PATCH` | `/admin/projects/:projectKey/flags/:flagKey/enabled`           | Sadece aç/kapa                                 |
| `GET`   | `/admin/projects/:projectKey/flags/:flagKey/history`           | Versiyon geçmişi                               |
| `POST`  | `/admin/projects/:projectKey/flags/:flagKey/rollback/:version` | Eski versiyona dön                             |

Tam Swagger: `http://localhost:3001/docs`.

---

## Mimari istisnalar

Bu servis, şirketin `nestjs-service-template`'inden **yapısal olarak** (klasör düzeni, test konumu, lint/format, git hook'ları, Docker) uyarlanmıştır, ama template'in zorunlu koştuğu şu üç şeyi **bilinçli olarak kullanmaz**:

| Template kuralı                                               | flag-api'de gerçek durum                                                     | Neden                                                                                                                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fiyuu/nest-js-postgres` (TypeORM/migration yasak)           | **TypeORM + gerçek migration'lar** kullanılıyor (`src/database/migrations/`) | Bu servis versiyonlama/rollback için satır bazlı transactional yazım ve optimistic-concurrency'e bağımlı; `@fiyuu/nest-js-postgres`'in örneklerinde migration veya transaction desteği görülmedi. |
| `@nestjs/config` yasak, `src/config/env.ts` singleton zorunlu | **`@nestjs/config`** (`ConfigModule.forRoot`) kullanılıyor                   | Mevcut, test edilmiş `registerAs` tabanlı config yapısı korunuyor; değiştirmek risksiz bir fayda sağlamıyordu.                                                                                    |
| NestJS `Logger` yasak, `@fiyuu/nest-js-logger` zorunlu        | **NestJS'in kendi `Logger`'ı** kullanılıyor                                  | `@fiyuu/nest-js-logger` bu servise entegre edilmedi (private paket, ayrı bir karar gerektirir).                                                                                                   |

`@fiyuu/nest-js-*` paketlerine tam geçiş — özellikle `@fiyuu/nest-js-postgres` — ayrı, daha büyük bir karar olarak platform ekibiyle değerlendirilmeli; bu servisin mevcut veri bütünlüğü garantilerini (transaction, optimistic-concurrency) korumadan yapılmamalı.

---

## Şema / migration

Prod'da (ve `DB_SYNC=false` olan her ortamda) şema **migration** ile yönetilir, auto-sync ile değil:

```bash
npm run migration:generate -- src/database/migrations/Açıklayıcıİsim  # entity değişince
npm run migration:run                                                 # uygula
npm run migration:revert                                              # bir öncekine dön
```

Migration'lar deploy pipeline'ının açık bir adımı olarak çalıştırılmalı (build → migration:run → uygulamayı başlat) — uygulamanın kendisi boot'ta migration çalıştırmaz. Çoklu instance aynı anda ayağa kalktığında migration'ların yarışmasını engelleyen bir kilit yok; bu yüzden migration'ı her zaman **tek** bir adımda, yeni instance'lar başlamadan önce çalıştırın.

Local geliştirmede `DB_SYNC=true` (`.env.example`) kullanmaya devam edebilirsiniz — migration gerekmez.

---

## Scripts

| Script                                                                                    | Description                               |
| ----------------------------------------------------------------------------------------- | ----------------------------------------- |
| `pnpm run start:local`                                                                    | Docker altyapı + Nest watch modu          |
| `pnpm run start:dev`                                                                      | Nest watch modu                           |
| `pnpm run start:prod`                                                                     | Derlenmiş `dist`'i çalıştır               |
| `pnpm run build`                                                                          | Projeyi derle                             |
| `pnpm run lint`                                                                           | ESLint (autofix)                          |
| `pnpm run format`                                                                         | Prettier format                           |
| `pnpm run test`                                                                           | Birim testleri                            |
| `pnpm run test:e2e`                                                                       | E2E testleri                              |
| `pnpm run test:cov`                                                                       | Coverage raporu                           |
| `pnpm run migration:generate` / `migration:run` / `migration:revert` / `migration:create` | Bkz. [Şema / migration](#şema--migration) |

---

## Testing

```bash
pnpm run test
pnpm run test:e2e
pnpm run test:cov
```

```
test/
└── modules/
    ├── flags/
    ├── projects/
    ├── request-log/
    ├── health/
    └── common/
        ├── throttling/
        └── logging/
```

---

## Deployment

### Docker

```bash
docker build -t feature-flag-api:latest .
docker run -p 127.0.0.1:3001:3001 --env-file .env feature-flag-api:latest
```

`Dockerfile` iki aşamalı: `builder` aşaması bağımlılıkları kurup `pnpm run build` çalıştırır, final image sadece `dist` + prod bağımlılıklarını içerir. `NODE_ENV=production` Dockerfile'da açıkça set edilir (baked-in `.env.example`'ın `NODE_ENV=development` varsayılanının prod'da dev-only davranışları — ör. proje seed'i — tetiklememesi için).

> **Prod'a alırken:** `ProjectsController` (`admin/projects`) ve `RequestLogController` (`admin/request-logs`) uygulama içinde korunmuyor (bkz. [Kimlik doğrulama](#kimlik-doğrulama-flags_api_key)) — bu servis, önüne gerçek erişim kontrolü uygulayan bir API Gateway/network sınırı olmadan doğrudan internete açılmamalı. Yukarıdaki `docker run` örneği de kasıtlı olarak sadece `127.0.0.1`'e bağlanır.

---

## Kimlik doğrulama (`FLAGS_API_KEY`)

- Guard: `FlagsApiKeyGuard` — `FlagsSdkController` ve `FlagsAdminController` üzerinde, **zorunlu**. `FLAGS_API_KEY` tanımlı değilse süreç başlamaz.
- İstemci: `@core-sdk/feature-flags-sdk` içinde `apiKey` doluysa `Authorization: Bearer` otomatik eklenir (`getHeaders` ile özelleştirilebilir).

> **Not:** `ProjectsController` (`admin/projects`) ve `RequestLogController` (`admin/request-logs`) kasıtlı olarak `FlagsApiKeyGuard` kullanmaz — bu uçların korunması ağ katmanına (ayrı bir API Gateway arkasında, dışarıya kapalı) bırakılmıştır. `ProjectsAdminGuard` bu nedenle bilinçli bir placeholder'dır; bu varsayım geçerliliğini yitirirse (ör. servis gateway olmadan expose edilirse) burada gerçek bir auth guard'a ihtiyaç duyulur.

## Loglama ve observability

- Operasyonel loglar NestJS `Logger` ile yazılır; token, parola, OTP, request body ve tam PII loglanmaz.
- Seçili kritik HTTP istekleri ve başarılı kritik mutasyonlar tek satır `audit: true` JSON stdout kaydı üretir.
- Instana yalnızca `ENABLE_METRICS=TRUE` iken trace/metrik için başlatılır; uygulama loglarının yerine geçmez.

## Bayrak `rules` modeli

Her kural satırı bir **koşul** (`id`, `active`, `filters`). Koşullar değerlendirmede **VEYA**; aynı koşuldaki filtreler **VE**. Filtre: `field`, `operator`, `value`. Sistem tek kural formatı kullanır.

Çekirdek değerlendirme paketi: **`@core-sdk/feature-flags-core`** — bağımlılık `package.json` içinde tanımlıdır; `pnpm install` ile çözülür.

## Ownership & contact

| Role       | Contact           |
| ---------- | ----------------- |
| Team       | {TEAM_NAME}       |
| Slack      | `{#channel-name}` |
| Repository | {GitLab repo URL} |

## Lisans

Proje private / UNLICENSED olabilir; kurumsal politikanıza göre güncelleyin.
