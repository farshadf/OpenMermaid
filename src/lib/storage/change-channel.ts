import { isRecord } from '../documents';

export type DocumentChangeKind = 'put' | 'delete' | 'clear';

export interface DocumentChangeNotification {
  protocol: 'openmermaid-documents-v1';
  senderId: string;
  kind: DocumentChangeKind;
  id?: string;
  revision?: number;
  timestamp: string;
}

export interface BroadcastChannelLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

export type BroadcastChannelFactory = (name: string) => BroadcastChannelLike;

export function isDocumentChangeNotification(value: unknown): value is DocumentChangeNotification {
  if (!isRecord(value)) return false;
  if (
    value.protocol !== 'openmermaid-documents-v1' ||
    typeof value.senderId !== 'string' ||
    typeof value.kind !== 'string' ||
    !['put', 'delete', 'clear'].includes(value.kind) ||
    typeof value.timestamp !== 'string' ||
    !Number.isFinite(Date.parse(value.timestamp))
  ) {
    return false;
  }

  if (value.kind === 'clear') return value.id === undefined && value.revision === undefined;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (value.kind === 'put')
    return Number.isSafeInteger(value.revision) && (value.revision as number) >= 0;
  return value.revision === undefined;
}
