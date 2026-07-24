import type { PerformancePageKind } from './contracts';

function normalizePathname(input: string): string {
  try {
    return new URL(input, 'https://openmermaid.invalid').pathname;
  } catch {
    return '/';
  }
}

export function classifyPerformancePage(input: string): PerformancePageKind {
  const pathname = normalizePathname(input).replace(/\/{2,}/gu, '/');
  if (pathname === '/') return 'home';
  if (/^\/editor\/?$/u.test(pathname)) return 'editor';
  if (/^\/templates\/?$/u.test(pathname)) return 'templates';
  if (pathname.startsWith('/templates/')) return 'template';
  if (/^\/guides\/?$/u.test(pathname)) return 'guides';
  if (pathname.startsWith('/guides/')) return 'guide';
  if (/^\/about\/?$/u.test(pathname)) return 'about';
  if (/^\/privacy\/?$/u.test(pathname)) return 'privacy';
  if (/^\/security\/?$/u.test(pathname)) return 'security';
  if (/^\/performance\/?$/u.test(pathname)) return 'performance';
  if (/\/(?:404\.html)?$/u.test(pathname) && pathname.includes('404')) return 'not-found';
  return 'other';
}
