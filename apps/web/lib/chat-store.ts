import type { ChatTranscriptMessage } from './chat/prompt';
import type { SlotState } from './chat/tracker';

/** Everything needed to restore a conversation after a reload or account link (AC-12). */
export interface ChatSession {
  transcript: ChatTranscriptMessage[];
  slotState: SlotState;
  /** LLM attempts so far; drives the 40-turn cap (AC-81). */
  llmTurns: number;
  capNoticeSent: boolean;
}

export interface ChatSessionStore {
  save(candidateId: string, session: ChatSession): void;
  get(candidateId: string): ChatSession | undefined;
  delete(candidateId: string): boolean;
}

export function createInMemoryChatSessionStore(): ChatSessionStore {
  const byCandidate = new Map<string, ChatSession>();
  return {
    save: (id, session) => void byCandidate.set(id, structuredClone(session)),
    get: (id) => {
      const found = byCandidate.get(id);
      return found ? structuredClone(found) : undefined;
    },
    delete: (id) => byCandidate.delete(id),
  };
}

export const chatSessionStore: ChatSessionStore = createInMemoryChatSessionStore();
