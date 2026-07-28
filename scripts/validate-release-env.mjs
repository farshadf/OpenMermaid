const siteUrl = process.env.PUBLIC_SITE_URL;
const indexSite = process.env.PUBLIC_INDEX_SITE;
const telemetryMode = process.env.PUBLIC_TELEMETRY_MODE ?? 'off';

const errors = [];

if (siteUrl === undefined) {
  errors.push('PUBLIC_SITE_URL is required for a release build.');
} else {
  try {
    const parsed = new URL(siteUrl);
    if (parsed.protocol !== 'https:') errors.push('PUBLIC_SITE_URL must use HTTPS.');
    if (parsed.hostname.endsWith('.example'))
      errors.push('PUBLIC_SITE_URL must not use an example domain.');
    if (
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      errors.push('PUBLIC_SITE_URL must be an origin without credentials, a path, query, or hash.');
    }
  } catch {
    errors.push('PUBLIC_SITE_URL must be a valid absolute URL.');
  }
}

if (indexSite !== 'true') {
  errors.push(
    'Set PUBLIC_INDEX_SITE=true only after name, domain, content, and production readiness review.',
  );
}

if (!['off', 'aggregate'].includes(telemetryMode)) {
  errors.push('PUBLIC_TELEMETRY_MODE must be either "off" or "aggregate".');
}

if (errors.length > 0) {
  console.error(`Release environment is not ready:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(`Release environment validated for ${siteUrl}`);
