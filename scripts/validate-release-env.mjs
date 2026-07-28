const siteUrl = process.env.PUBLIC_SITE_URL;
const indexSite = process.env.PUBLIC_INDEX_SITE;
const telemetryMode = process.env.PUBLIC_TELEMETRY_MODE ?? 'off';
const adMode = process.env.PUBLIC_AD_MODE ?? 'off';

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

if (!['off', 'placeholder', 'agency'].includes(adMode)) {
  errors.push('PUBLIC_AD_MODE must be "off", "placeholder", or "agency".');
}
if (adMode === 'placeholder') {
  errors.push('PUBLIC_AD_MODE=placeholder is forbidden in a release build.');
}
if (adMode === 'agency') {
  if (process.env.PUBLIC_AD_PROVIDER !== 'google-adsense') {
    errors.push('PUBLIC_AD_PROVIDER must be google-adsense for the agency release.');
  }
  if (!/^ca-pub-\d{16}$/u.test(process.env.PUBLIC_ADSENSE_CLIENT ?? '')) {
    errors.push('PUBLIC_ADSENSE_CLIENT must match ca-pub- followed by 16 digits.');
  }
  if (!/^\d{1,20}$/u.test(process.env.PUBLIC_ADSENSE_SLOT ?? '')) {
    errors.push('PUBLIC_ADSENSE_SLOT must contain 1 to 20 digits.');
  }

  let editorOrigin;
  try {
    editorOrigin = new URL(process.env.PUBLIC_EDITOR_ORIGIN ?? '');
    if (
      editorOrigin.protocol !== 'https:' ||
      editorOrigin.username !== '' ||
      editorOrigin.password !== '' ||
      editorOrigin.pathname !== '/' ||
      editorOrigin.search !== '' ||
      editorOrigin.hash !== ''
    ) {
      errors.push('PUBLIC_EDITOR_ORIGIN must be an HTTPS origin without path, query, or fragment.');
    }
  } catch {
    errors.push('PUBLIC_EDITOR_ORIGIN is required as a valid HTTPS origin for agency advertising.');
  }

  if (siteUrl !== undefined && editorOrigin instanceof URL) {
    try {
      if (new URL(siteUrl).hostname === editorOrigin.hostname) {
        errors.push(
          'PUBLIC_EDITOR_ORIGIN must use a different hostname from PUBLIC_SITE_URL for storage isolation.',
        );
      }
    } catch {
      // The general PUBLIC_SITE_URL validation above reports this.
    }
  }
}

if (errors.length > 0) {
  console.error(`Release environment is not ready:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(`Release environment validated for ${siteUrl}`);
