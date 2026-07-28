function configuredOrigin(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  return new URL(value).origin;
}

export const publicSiteOrigin = configuredOrigin(import.meta.env.PUBLIC_SITE_URL);
export const editorSiteOrigin =
  configuredOrigin(import.meta.env.PUBLIC_EDITOR_ORIGIN) ?? publicSiteOrigin;

export function publicHref(path = '/'): string {
  return publicSiteOrigin === undefined ? path : new URL(path, publicSiteOrigin).toString();
}

export function editorHref(search = ''): string {
  const relative = `/editor/${search}`;
  return editorSiteOrigin === undefined ? relative : new URL(relative, editorSiteOrigin).toString();
}
