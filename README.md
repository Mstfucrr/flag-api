# feature-flag-api

NestJS tabanlı **özellik bayrağı (feature flag)** servisi: projeler ve bayraklar PostgreSQL (TypeORM) üzerinde saklanır; çalışma zamanı değerlendirmesi ve yönetim uçları sunulur. Özellik değerlendirme motoru olarak **`@core-sdk/feature-flags-core`** kullanılır.

## Özellikler (özet)

- **Projeler** — oluşturma, listeleme, proje silme (ilişkili bayraklar temizlenir).
- **Bayraklar** — oluşturma, güncelleme, silme, sürüm geçmişi, geri alma (rollback).
- **Çalışma zamanı API** — `GET /projects/:projectKey/flags`, `POST …/flags/evaluate` (SDK ile uyumlu).
- **İstek günlüğü (request log)** — yönetim işlemleri için denetim izi.
- **Swagger** — uygulama ayakta iken `/docs` (JSON: `/docs/json`).
- **CORS** — `Authorization`, `X-Principal-Id` vb. başlıklar açıkça listelenir (portal / harici istemciler için).

## Gereksinimler

- Node.js **18+**
- **pnpm** (projede pnpm kullanımı önerilir)
- PostgreSQL ve yapılandırma ortam değişkenleri (ör. veritabanı bağlantısı; ayrıntılar için `src/config` ve `.env` örneklerinize bakın)

## Kurulum ve çalıştırma

```bash
pnpm install
```

Geliştirme (dosya izleme):

```bash
pnpm run start:dev
```

Varsayılan dinleme portu **`4000`** (`PORT` ile değiştirilebilir). API kökü üzerinden Swagger’a gidin: `http://localhost:4000/docs`.

Üretim derlemesi ve çalıştırma:

```bash
pnpm run build
pnpm run start:prod
```

## Testler

```bash
pnpm run test          # birim testleri
pnpm run test:e2e      # e2e
pnpm run test:cov      # kapsam
```

## İlgili depolar

- **`core-sdk`** — `@core-sdk/feature-flags-sdk` ve `@core-sdk/feature-flags-react` ile tarayıcı / Node istemcileri bu API’ye bağlanır.

## Lisans

Proje `package.json` içinde belirtildiği gibi **UNLICENSED** (private) olarak işaretlenebilir; kurum içi kullanım için lisansı kendi politikalarınıza göre güncelleyin.
