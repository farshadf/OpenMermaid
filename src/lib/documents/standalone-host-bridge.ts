import type { EditorHostBridge, EditorHostCapabilities } from './contracts';

export const STANDALONE_EDITOR_CAPABILITIES: Readonly<EditorHostCapabilities> = Object.freeze({
  publishDocument: false,
  fullscreen: true,
  externalNavigation: true,
  fileUpload: true,
});

/** The v1 host has no remote publish path and never reads host-specific configuration. */
export function createStandaloneEditorHostBridge(
  capabilityOverrides: Partial<Omit<EditorHostCapabilities, 'publishDocument'>> = {},
): EditorHostBridge {
  return {
    capabilities: {
      ...STANDALONE_EDITOR_CAPABILITIES,
      ...capabilityOverrides,
      publishDocument: false,
    },
  };
}
