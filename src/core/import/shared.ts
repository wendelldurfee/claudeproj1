import type { ExamBank, Question } from '../types';

/** Shared helpers for every bank importer. */

export interface ImportResult {
  bank: ExamBank;
  /** Non-fatal problems: dropped questions, missing keys, guessed types. */
  warnings: string[];
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Stable, filesystem-safe slug used to build bank and question ids. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Short deterministic hash (FNV-1a). Question ids are derived from their text so
 * re-importing an updated dump keeps history attached to unchanged questions.
 */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function makeBankId(code: string, title: string): string {
  return `${slugify(code || title || 'bank')}-${hashString(`${code}|${title}`)}`;
}

export function makeQuestionId(bankId: string, stem: string, index: number): string {
  return `${bankId}-q${index + 1}-${hashString(stem)}`;
}

/** Letter index for "A." style option markers. */
export function letterToIndex(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 65;
}

export function indexToLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * Infers the question type from its answer key when the source format does not
 * declare one. Two or more correct options means multi-select; a two-option
 * True/False pair is recognised so it renders with the right control.
 */
export function inferType(correctCount: number, choices: { text: string }[]): Question['type'] {
  if (choices.length === 2) {
    const texts = choices.map((c) => c.text.trim().toLowerCase());
    if (texts.includes('true') && texts.includes('false')) return 'truefalse';
  }
  return correctCount > 1 ? 'multiple' : 'single';
}

/** Normalises line endings and strips a UTF-8 BOM. */
export function normaliseSource(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export function emptyBank(overrides: Partial<ExamBank> = {}): ExamBank {
  const code = overrides.code ?? 'CUSTOM';
  const title = overrides.title ?? 'Imported Question Bank';
  return {
    id: overrides.id ?? makeBankId(code, title),
    code,
    title,
    vendor: overrides.vendor,
    description: overrides.description,
    passingScore: overrides.passingScore ?? 70,
    timeLimitMinutes: overrides.timeLimitMinutes ?? 90,
    questionCount: overrides.questionCount,
    version: overrides.version,
    source: overrides.source,
    importedAt: overrides.importedAt ?? Date.now(),
    sections: overrides.sections ?? [],
    caseStudies: overrides.caseStudies ?? [],
    questions: overrides.questions ?? [],
  };
}

/**
 * Drops questions that can never be graded (no options, or no answer key) and
 * reports each one, rather than importing a bank that silently marks
 * everything wrong.
 */
export function pruneInvalid(questions: Question[], warnings: string[]): Question[] {
  return questions.filter((q) => {
    const needsChoices = ['single', 'multiple', 'truefalse', 'ordering', 'dragdrop', 'matching'];
    if (needsChoices.includes(q.type) && (q.choices ?? []).length === 0) {
      warnings.push(`Skipped question ${q.number ?? q.id}: no answer options found.`);
      return false;
    }
    if (q.correct.length === 0) {
      warnings.push(`Skipped question ${q.number ?? q.id}: no correct answer found.`);
      return false;
    }
    return true;
  });
}
