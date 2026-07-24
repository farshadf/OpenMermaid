export const english = {
  siteName: 'Open Mermaid',
  siteTagline: 'Private, fast Mermaid diagrams in your browser',
  siteDescription:
    'Create, validate, share, and export Mermaid diagrams in a private local workspace. No account, backend, network analytics, or API key required.',
  navigation: {
    home: 'Home',
    editor: 'Editor',
    templates: 'Templates',
    guides: 'Guides',
    about: 'About',
  },
  actions: {
    openEditor: 'Open the editor',
    browseTemplates: 'Browse templates',
    readGuides: 'Read the guides',
    viewTemplate: 'View template',
    readGuide: 'Read guide',
  },
  privacyPromise: 'Diagram content stays on this device unless you explicitly share or export it.',
  footer: {
    project: 'Project',
    legal: 'Privacy and security',
    sourceNotice: 'Standalone Mermaid editing with local processing by default.',
    independence:
      'Open Mermaid is an independent project and is not affiliated with the Mermaid project or OpenAI.',
  },
} as const;

export type EnglishContent = typeof english;
