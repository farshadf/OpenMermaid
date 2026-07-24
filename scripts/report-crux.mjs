import { mkdir, writeFile } from 'node:fs/promises';

const outputDirectory = new URL('../reports/', import.meta.url);
const jsonOutput = new URL('crux-history.json', outputDirectory);
const markdownOutput = new URL('crux-history.md', outputDirectory);
const endpoint = 'https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord';
const metricNames = {
  largest_contentful_paint: 'LCP',
  interaction_to_next_paint: 'INP',
  cumulative_layout_shift: 'CLS',
};
const thresholds = { LCP: 2_500, INP: 200, CLS: 0.1 };

function canonicalOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(
      'PUBLIC_SITE_URL must be an HTTPS origin without credentials, path, query, or fragment.',
    );
  }
  return url.origin;
}

function latestMetric(metrics, metricName) {
  const p75s = metrics?.[metricName]?.percentilesTimeseries?.p75s;
  if (!Array.isArray(p75s) || p75s.length === 0) return undefined;
  const raw = p75s.at(-1);
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const name = metricNames[metricName];
  return { name, value, passes: value <= thresholds[name] };
}

async function queryHistory(apiKey, identifier, formFactor) {
  const response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...identifier, formFactor, collectionPeriodCount: 40 }),
  });
  if (response.status === 404) return { status: 'insufficient-data' };
  if (!response.ok) throw new Error(`CrUX History API returned HTTP ${String(response.status)}.`);
  const payload = await response.json();
  const periods = payload?.record?.collectionPeriods;
  const metrics = payload?.record?.metrics;
  if (!Array.isArray(periods) || typeof metrics !== 'object' || metrics === null) {
    throw new Error('CrUX History API returned an unexpected response shape.');
  }
  const latestPeriod = periods.at(-1);
  return {
    status: 'available',
    latestPeriod,
    metrics: Object.keys(metricNames)
      .map((name) => latestMetric(metrics, name))
      .filter((metric) => metric !== undefined),
  };
}

function markdown(report) {
  const lines = [
    '# Open Mermaid CrUX history',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Canonical origin: ${report.origin ?? 'not configured'}`,
    '',
  ];
  if (report.status !== 'queried') {
    lines.push(
      'CrUX reporting is not configured. This is informational while the canonical domain is undecided.',
      '',
    );
    return `${lines.join('\n')}\n`;
  }
  lines.push(
    '| Scope | Form factor | Status | LCP p75 | INP p75 | CLS p75 |',
    '| --- | --- | --- | ---: | ---: | ---: |',
  );
  for (const result of report.results) {
    const values = Object.fromEntries(
      (result.metrics ?? []).map((metric) => [metric.name, metric.value]),
    );
    lines.push(
      `| ${result.scope} | ${result.formFactor} | ${result.status} | ${values.LCP ?? '—'} | ${values.INP ?? '—'} | ${values.CLS ?? '—'} |`,
    );
  }
  lines.push(
    '',
    'Values are rolling field p75 measurements. Missing data is not a release failure.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

const siteUrl = process.env.PUBLIC_SITE_URL;
const apiKey = process.env.CRUX_API_KEY;
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'Chrome UX Report History API',
  status: 'not-configured',
  origin: undefined,
  results: [],
};

if (siteUrl !== undefined && siteUrl !== '' && apiKey !== undefined && apiKey !== '') {
  report.origin = canonicalOrigin(siteUrl);
  report.status = 'queried';
  const targets = [
    { scope: 'origin', identifier: { origin: report.origin } },
    { scope: 'editor', identifier: { url: new URL('/editor/', report.origin).toString() } },
  ];
  for (const target of targets) {
    for (const formFactor of ['PHONE', 'DESKTOP']) {
      const result = await queryHistory(apiKey, target.identifier, formFactor);
      report.results.push({ scope: target.scope, formFactor, ...result });
    }
  }
} else {
  console.log('CrUX reporting skipped: set the final PUBLIC_SITE_URL and CI-only CRUX_API_KEY.');
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(markdownOutput, markdown(report));
console.log(`CrUX history report written with status: ${report.status}.`);
