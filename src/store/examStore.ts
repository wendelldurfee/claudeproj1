import { create } from 'zustand';
import { isComplete } from '../core/grading';
import { randomSeed } from '../core/random';
import { gradeSession } from '../core/scoring';
import { createSession, sessionReducer, type SessionAction } from '../core/session';
import type { AttemptResult, ExamBank, Question, Response, SessionConfig, SessionState } from '../core/types';
import {
  deleteSession,
  getBank,
  getQuestionHistory,
  getSession,
  saveAttempt,
  saveSession,
  setQuestionMarked,
} from '../db/repositories';

/**
 * The live exam attempt.
 *
 * All state transitions go through the pure `sessionReducer`; this store only
 * adds persistence. Every change is written back to SQLite on a short debounce
 * so a killed app resumes mid-exam with the clock intact.
 */

const AUTOSAVE_MS = 1500;

interface ExamState {
  bank: ExamBank | null;
  /** Question lookup for the questions actually drawn into this attempt. */
  questions: Map<string, Question>;
  session: SessionState | null;
  result: AttemptResult | null;
  loading: boolean;
  error: string | null;

  start: (bankId: string, config: Omit<SessionConfig, 'seed'> & { seed?: number }) => Promise<string>;
  resume: (sessionId: string) => Promise<boolean>;
  dispatch: (action: SessionAction) => void;
  answer: (index: number, response: Response) => void;
  toggleMark: (index: number) => void;
  submit: () => Promise<AttemptResult | null>;
  discard: () => Promise<void>;
  clear: () => void;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(state: SessionState) {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    void saveSession(state).catch(() => {
      // A failed autosave must never interrupt an exam in progress; the next
      // tick will try again, and submit() writes synchronously regardless.
    });
  }, AUTOSAVE_MS);
}

function flushSave(state: SessionState): Promise<void> {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  return saveSession(state);
}

export const useExamStore = create<ExamState>((set, get) => ({
  bank: null,
  questions: new Map(),
  session: null,
  result: null,
  loading: false,
  error: null,

  start: async (bankId, config) => {
    set({ loading: true, error: null, result: null });
    try {
      const bank = await getBank(bankId);
      if (!bank) throw new Error('That exam bank is no longer installed.');

      const history = await getQuestionHistory(bankId);
      const session = createSession({
        id: `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        bank,
        config: { ...config, seed: config.seed ?? randomSeed() },
        history,
      });

      await saveSession(session);

      set({
        bank,
        session,
        questions: buildQuestionMap(bank, session),
        loading: false,
      });
      return session.id;
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  resume: async (sessionId) => {
    // Already in memory — nothing to reload.
    if (get().session?.id === sessionId && get().bank) return true;

    set({ loading: true, error: null });
    try {
      const session = await getSession(sessionId);
      if (!session) {
        set({ loading: false, error: 'That attempt could not be found.' });
        return false;
      }

      const bank = await getBank(session.bankId);
      if (!bank) {
        set({ loading: false, error: 'The exam bank for that attempt was removed.' });
        return false;
      }

      // The clock keeps running while the app is closed, so a resumed attempt
      // may already be over. Reconcile before showing anything.
      const reconciled = sessionReducer(session, { type: 'TICK' });

      set({
        bank,
        session: reconciled,
        questions: buildQuestionMap(bank, reconciled),
        loading: false,
      });
      return true;
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      return false;
    }
  },

  dispatch: (action) => {
    const current = get().session;
    if (!current) return;

    const next = sessionReducer(current, action);
    if (next === current) return;

    set({ session: next });
    scheduleSave(next);
  },

  answer: (index, response) => {
    const { session, questions } = get();
    const item = session?.items[index];
    const question = item ? questions.get(item.questionId) : undefined;

    get().dispatch({
      type: 'ANSWER',
      index,
      response,
      complete: question ? isComplete(question, response) : response.length > 0,
    });
  },

  toggleMark: (index) => {
    const session = get().session;
    if (!session) return;

    const item = session.items[index];
    get().dispatch({ type: 'TOGGLE_MARK', index });

    // Mirror the flag into the bank's history so "marked" survives the attempt.
    if (item) {
      void setQuestionMarked(session.bankId, item.questionId, !item.marked).catch(() => {});
    }
  },

  submit: async () => {
    const { session, bank } = get();
    if (!session || !bank) return null;

    const submitted = session.status === 'submitted'
      ? session
      : sessionReducer(session, { type: 'SUBMIT' });

    const result = gradeSession(submitted, bank, `a-${submitted.id}`);

    set({ session: submitted, result });

    await flushSave(submitted);
    await saveAttempt(result);

    return result;
  },

  discard: async () => {
    const session = get().session;
    if (!session) return;
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    await deleteSession(session.id);
    set({ session: null, bank: null, questions: new Map(), result: null });
  },

  clear: () => {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    set({ session: null, bank: null, questions: new Map(), result: null, error: null });
  },
}));

function buildQuestionMap(bank: ExamBank, session: SessionState): Map<string, Question> {
  const drawn = new Set(session.items.map((i) => i.questionId));
  return new Map(bank.questions.filter((q) => drawn.has(q.id)).map((q) => [q.id, q]));
}
