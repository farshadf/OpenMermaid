import { describe, expect, it } from 'vitest';
import {
  isAdvertisingAllowed,
  parseAdvertisingEnvironment,
} from '../../../src/lib/advertising/contracts';

describe('advertising configuration', () => {
  it('defaults to a byte-clean off mode', () => {
    const result = parseAdvertisingEnvironment({});
    expect(result.errors).toEqual([]);
    expect(result.config.mode).toBe('off');
    expect(isAdvertisingAllowed(result.config, 'guide-detail')).toBe(false);
  });

  it('rejects an unknown mode', () => {
    const result = parseAdvertisingEnvironment({ PUBLIC_AD_MODE: 'direct' });
    expect(result.config.mode).toBe('off');
    expect(result.errors).toContain('PUBLIC_AD_MODE must be "off", "placeholder", or "agency".');
  });

  it('keeps placeholders out of indexed releases', () => {
    const result = parseAdvertisingEnvironment({
      PUBLIC_AD_MODE: 'placeholder',
      PUBLIC_INDEX_SITE: 'true',
    });
    expect(result.config.mode).toBe('placeholder');
    expect(result.errors).toContain('PUBLIC_AD_MODE=placeholder is forbidden in an indexed build.');
  });

  it('accepts a complete Google AdSense configuration with isolated hostnames', () => {
    const result = parseAdvertisingEnvironment({
      PUBLIC_AD_MODE: 'agency',
      PUBLIC_AD_PROVIDER: 'google-adsense',
      PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890123456',
      PUBLIC_ADSENSE_SLOT: '1234567890',
      PUBLIC_EDITOR_ORIGIN: 'https://app.openmermaid.app',
      PUBLIC_INDEX_SITE: 'true',
      PUBLIC_SITE_URL: 'https://openmermaid.app',
    });

    expect(result.errors).toEqual([]);
    expect(result.config).toMatchObject({
      mode: 'agency',
      provider: 'google-adsense',
      publicOrigin: 'https://openmermaid.app',
      editorOrigin: 'https://app.openmermaid.app',
      consentStrategy: 'google-privacy-messaging',
    });
    expect(isAdvertisingAllowed(result.config, 'guide-detail')).toBe(true);
    expect(isAdvertisingAllowed(result.config, 'template-detail')).toBe(true);
  });

  it('rejects malformed account data and a shared editor hostname', () => {
    const result = parseAdvertisingEnvironment({
      PUBLIC_AD_MODE: 'agency',
      PUBLIC_AD_PROVIDER: 'google-adsense',
      PUBLIC_ADSENSE_CLIENT: 'publisher',
      PUBLIC_ADSENSE_SLOT: 'slot',
      PUBLIC_EDITOR_ORIGIN: 'https://openmermaid.app',
      PUBLIC_INDEX_SITE: 'true',
      PUBLIC_SITE_URL: 'https://openmermaid.app',
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        'PUBLIC_EDITOR_ORIGIN must use a different hostname from PUBLIC_SITE_URL to isolate local documents from agency code.',
        'PUBLIC_ADSENSE_CLIENT must match ca-pub- followed by 16 digits.',
        'PUBLIC_ADSENSE_SLOT must contain 1 to 20 digits.',
      ]),
    );
  });
});
