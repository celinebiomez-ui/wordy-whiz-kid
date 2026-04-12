export type WordType = 'nom' | 'verbe' | 'adjectif' | 'adverbe' | 'conjonction' | 'pronom' | 'determinant' | 'preposition' | 'expression' | 'autre';

export interface DictationWord {
  id: string;
  text: string;
  wordType: WordType;
  // For verbs: the tense to conjugate
  tense?: string;
  // Expected answers (e.g. for "Manger (imparfait)" → ["je mangeais", "tu mangeais", ...])
  expectedAnswers?: string[];
  isVerb: boolean;
}

export interface DictationList {
  id: string;
  name: string;
  words: DictationWord[];
  createdAt: string;
}

export type ValidationState = 'pending' | 'first-attempt' | 'correcting' | 'final';

export interface WordResult {
  wordId: string;
  word: string;
  expected: string;
  firstAttempt: string;
  secondAttempt?: string;
  score: number; // 1, 0.5, or 0
  state: ValidationState;
}

export interface DictationSession {
  id: string;
  date: string;
  level: 1 | 2;
  listId: string;
  listName: string;
  results: WordResult[];
  totalScore: number;
  maxScore: number;
  percentage: number;
}

export type AppView = 'home' | 'lists' | 'exercise' | 'results';
