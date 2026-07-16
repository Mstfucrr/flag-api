// k6 load test for POST /projects/:projectKey/flags/evaluate
//
// Her istekte context.accountId rastgele üretilir; böylece SDK/istemci tarafındaki
// TTL cache'i değil, gerçek "her kullanıcı farklı" senaryosunu ölçüyoruz — flag-api'ye
// (ve arkasındaki Redis'e) gerçekten kaç istek düştüğünü görmek için.
//
// Kurulum (macOS): brew install k6
//
// Kullanım:
//   BASE_URL=http://localhost:3001 \
//   PROJECT_KEY=load-test \
//   FLAG_KEY=load-test-flag \
//   k6 run scripts/loadtest/evaluate.js
//
// Sonucu dosyaya kaydedip (baseline) önlem sonrası tekrar çalıştırıp kıyaslamak için:
//   k6 run --summary-export=results/baseline.json scripts/loadtest/evaluate.js
//   ... değişiklik yap ...
//   k6 run --summary-export=results/after.json scripts/loadtest/evaluate.js

import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Yatay ölçekleme testi için: BASE_URLS="http://localhost:3001,http://localhost:3002,..."
// (virgülle ayrılmış) verilirse, her istek bunlar arasında round-robin dağıtılır —
// gerçek bir load balancer yerine, "N instance kapasiteyi çarpıyor mu" sorusunu
// tek makinede taklit etmek için.
const BASE_URLS = __ENV.BASE_URLS
  ? __ENV.BASE_URLS.split(',').map((u) => u.trim()).filter(Boolean)
  : [__ENV.BASE_URL || 'http://localhost:3001'];
const PROJECT_KEY = __ENV.PROJECT_KEY || 'load-test';
const FLAG_KEY = __ENV.FLAG_KEY || 'load-test-flag';
const API_KEY = __ENV.FLAGS_API_KEY || '';

// Hızlı doğrulama için: SMOKE=1 k6 run ... → 1 VU, 10sn.
const SMOKE = __ENV.SMOKE === '1';

// Sabit RPS'te kısa doğrulama (bisection için): STEADY_RPS=500 k6 run ...
// → ramp yok, doğrudan hedef RPS'te STEADY_DURATION boyunca (varsayılan 40sn) sabit yük.
const STEADY_RPS = __ENV.STEADY_RPS ? Number(__ENV.STEADY_RPS) : null;

const evaluateErrors = new Rate('evaluate_errors');
const evaluateDuration = new Trend('evaluate_duration', true);

export const options = SMOKE
  ? {
      vus: 1,
      duration: '10s',
      thresholds: {
        http_req_failed: ['rate<0.01'],
      },
    }
  : STEADY_RPS
    ? {
        scenarios: {
          evaluate_steady: {
            executor: 'constant-arrival-rate',
            rate: STEADY_RPS,
            timeUnit: '1s',
            duration: __ENV.STEADY_DURATION || '40s',
            preAllocatedVUs: Number(__ENV.PRE_ALLOCATED_VUS || 50),
            maxVUs: Number(__ENV.MAX_VUS || 3000),
          },
        },
        thresholds: {
          http_req_failed: ['rate<0.01'],
          http_req_duration: ['p(95)<300'],
        },
      }
    : {
      scenarios: {
        evaluate_ramp: {
          executor: 'ramping-arrival-rate',
          startRate: Number(__ENV.START_RPS || 10),
          timeUnit: '1s',
          preAllocatedVUs: Number(__ENV.PRE_ALLOCATED_VUS || 50),
          maxVUs: Number(__ENV.MAX_VUS || 500),
          stages: [
            { target: Number(__ENV.STAGE1_RPS || 50), duration: '1m' },
            { target: Number(__ENV.STAGE2_RPS || 150), duration: '2m' },
            { target: Number(__ENV.STAGE3_RPS || 300), duration: '2m' },
            { target: 0, duration: '30s' },
          ],
        },
      },
      thresholds: {
        http_req_failed: ['rate<0.01'],
        // p95 hedefi: kendi SLO'na göre ayarla.
        http_req_duration: ['p(95)<300'],
      },
    };

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    h['Authorization'] = `Bearer ${API_KEY}`;
  }
  return h;
}

function randomAccountId() {
  return `loadtest-${__VU}-${__ITER}-${Math.random().toString(36).slice(2, 10)}`;
}

// k6 her VU'yu ayrı bir JS VM'de çalıştırır (paylaşılan mutable state yok);
// __VU + __ITER kombinasyonu VU'lar arasında eşit dağılım sağlar.
function nextBaseUrl() {
  return BASE_URLS[(__VU + __ITER) % BASE_URLS.length];
}

export default function () {
  const url = `${nextBaseUrl()}/projects/${PROJECT_KEY}/flags/evaluate`;
  const body = JSON.stringify({
    flagKeys: [FLAG_KEY],
    // accountId her seferinde farklı → cache miss garantisi.
    context: { accountId: randomAccountId() },
  });

  const res = http.post(url, body, { headers: headers() });

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'has results': (r) => {
      try {
        return typeof r.json('results') === 'object';
      } catch {
        return false;
      }
    },
  });

  evaluateErrors.add(!ok);
  evaluateDuration.add(res.timings.duration);
}
