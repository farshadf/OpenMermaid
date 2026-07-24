export const SITE_TITLE = 'Open Mermaid';
export const SITE_DESCRIPTION =
  'Create, validate, share, and export Mermaid diagrams in a private local browser workspace.';

export const publicNavigation = [
  { href: '/', label: 'Home' },
  { href: '/editor/', label: 'Editor' },
  { href: '/templates/', label: 'Templates' },
  { href: '/guides/', label: 'Guides' },
  { href: '/about/', label: 'About' },
] as const;

export interface Breadcrumb {
  href: string;
  label: string;
}
