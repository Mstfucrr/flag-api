# feature-flag-api

`feature-flag-api`, NestJS tabanlı bir özellik bayrağı servisidir. Proje ve bayrak verilerini PostgreSQL üzerinde tutar; runtime değerlendirme, yönetim işlemleri, sürüm geçmişi ve denetim kayıtlarını sağlar.

## Temel yetenekler

- Proje oluşturma, listeleme, silme
- Bayrak oluşturma, güncelleme, silme
- Sürüm geçmişi ve rollback
- Runtime evaluate uçları (`/projects/:projectKey/flags/evaluate`)
- Request log sorgulama ve yönetim izlenebilirliği
- Swagger dokümantasyonu (`/docs`, `/docs/json`)

## Gereksinimler

- Node.js 18+
- pnpm
- PostgreSQL
- Gerekli ortam değişkenleri (`PORT`, DB bağlantı ayarları vb.)

## Kurulum

```bash
pnpm install
```

## Çalıştırma

Geliştirme:

```bash
pnpm run start:dev
```

Üretim:

```bash
pnpm run build
pnpm run start:prod
```

Varsayılan port: `4000` (değişken: `PORT`).

## Test

```bash
pnpm run test
pnpm run test:e2e
pnpm run test:cov
```

## Bayrak `rules` şekli (0.0.4+)

Her öğe bir **koşul** (`id`, `active`, `filters`). Koşullar değerlendirmede **VEYA**; aynı koşuldaki `filters` öğeleri **VE** ile birleşir. Her filtre: `field`, `operator`, `value` (isteğe bağlı `id`). Düz `{ id, field, operator, value, active }` satırları çekirdek pakette otomatik olarak tek filtrelı koşula normalize edilir.

Bu API sürümü `@core-sdk/feature-flags-core` **^0.5.0** kullanır.

## SDK uyumu

`@core-sdk/feature-flags-sdk` şu uçları kullanır:

- `GET /projects/:projectKey/flags`
- `POST /projects/:projectKey/flags/evaluate`
- `GET /projects/:projectKey/flags/:flagKey/history`
- `GET /projects/:projectKey/flags/:flagKey/versions/:version`

## Lisans

Proje private/UNLICENSED kullanım modeliyle yönetilebilir. Kurumsal lisans politikanıza göre güncelleyin.
