import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Check, ArrowRight, RotateCcw, Home } from 'lucide-react';
import { DictationList, DictationWord, WordResult, DictationSession, ValidationState } from '@/lib/types';
import { useSpeech } from '@/hooks/useSpeech';
import { saveSession } from '@/lib/storage';

interface Props {
  list: DictationList;
  onFinish: (session: DictationSession) => void;
  onBack: () => void;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Check which words from the pool appear in the user's sentence */
function findUsedWords(sentence: string, remainingWords: DictationWord[]): { used: DictationWord[]; correctlySpelled: DictationWord[]; misspelled: DictationWord[] } {
  const sentenceNorm = normalize(sentence);
  const sentenceWords = sentenceNorm.split(/\s+/);

  const used: DictationWord[] = [];
  const correctlySpelled: DictationWord[] = [];
  const misspelled: DictationWord[] = [];

  for (const word of remainingWords) {
    const wordNorm = normalize(word.text);
    // For multi-word expressions, check if the whole expression is in the sentence
    if (wordNorm.includes(' ')) {
      if (sentenceNorm.includes(wordNorm)) {
        used.push(word);
        correctlySpelled.push(word);
      }
    } else {
      // Single word: check if any word in the sentence matches
      const found = sentenceWords.some(sw => sw === wordNorm);
      if (found) {
        used.push(word);
        correctlySpelled.push(word);
      } else {
        // Check if the word is present but misspelled (fuzzy: at least 60% similar)
        const close = sentenceWords.some(sw => similarity(sw, wordNorm) >= 0.6 && sw.length >= 2);
        if (close) {
          used.push(word);
          misspelled.push(word);
        }
      }
    }
  }

  return { used, correctlySpelled, misspelled };
}

/** Simple similarity ratio between two strings */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  const editDist = levenshtein(longer, shorter);
  return (longer.length - editDist) / longer.length;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

/** Highlight misspelled target words in the sentence */
function HighlightedSentence({ sentence, misspelledWords }: { sentence: string; misspelledWords: DictationWord[] }) {
  const words = sentence.trim().split(/\s+/);
  const misspelledNorms = misspelledWords.map(w => normalize(w.text));

  return (
    <p className="text-sm font-body leading-relaxed">
      {words.map((word, i) => {
        const wordNorm = word.toLowerCase().replace(/[.,!?;:]+$/, '');
        const isMisspelled = misspelledNorms.some(m => similarity(wordNorm, m) >= 0.6 && wordNorm !== m);
        return (
          <span key={i}>
            {i > 0 && ' '}
            <span className={isMisspelled ? 'text-destructive font-bold underline' : 'text-foreground'}>
              {word}
            </span>
          </span>
        );
      })}
    </p>
  );
}

export default function DictationLevel2({ list, onFinish, onBack }: Props) {
  const { speak } = useSpeech();
  const [remainingWords, setRemainingWords] = useState<DictationWord[]>(() =>
    list.words.map(w => ({
      ...w,
      wordType: w.wordType || (w.isVerb ? 'verbe' : 'autre'),
      isVerb: w.isVerb ?? false,
    }))
  );
  const [userInput, setUserInput] = useState('');
  const [state, setState] = useState<ValidationState>('pending');
  const [results, setResults] = useState<WordResult[]>([]);
  const [firstAttempt, setFirstAttempt] = useState('');
  const [roundMisspelled, setRoundMisspelled] = useState<DictationWord[]>([]);
  const [roundUsed, setRoundUsed] = useState<DictationWord[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [roundNumber, setRoundNumber] = useState(1);
  const totalWords = list.words.length;

  const handleSpeakWord = useCallback((text: string) => {
    speak(text);
  }, [speak]);

  // Global Enter key for final state
  useEffect(() => {
    if (state !== 'final') return;
    let ready = false;
    const onKeyUp = () => { ready = true; };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && ready) handleNext();
    };
    window.addEventListener('keyup', onKeyUp, { once: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [state, remainingWords, results]);

  const handleFirstValidation = () => {
    if (!userInput.trim()) return;
    setFirstAttempt(userInput);

    const { used, correctlySpelled, misspelled } = findUsedWords(userInput, remainingWords);

    if (misspelled.length === 0 && used.length > 0) {
      // All used words are correct
      const newResults = used.map(w => ({
        wordId: w.id,
        word: w.text,
        expected: w.text,
        firstAttempt: userInput,
        score: 1,
        state: 'final' as ValidationState,
      }));
      setResults(prev => [...prev, ...newResults]);
      setRoundUsed(used);
      setRoundMisspelled([]);
      setState('final');
    } else if (used.length === 0) {
      // No words from the list were used
      setState('correcting');
      setRoundMisspelled([]);
      setRoundUsed([]);
    } else {
      // Some words misspelled
      setState('correcting');
      setRoundMisspelled(misspelled);
      setRoundUsed(used);
    }
  };

  const handleSecondValidation = () => {
    if (!userInput.trim()) return;

    const { used, correctlySpelled, misspelled } = findUsedWords(userInput, remainingWords);

    const newResults: WordResult[] = [];

    // Words correctly spelled on second attempt
    for (const w of correctlySpelled) {
      newResults.push({
        wordId: w.id,
        word: w.text,
        expected: w.text,
        firstAttempt,
        secondAttempt: userInput,
        score: 0.5,
        state: 'final',
      });
    }

    // Words still misspelled
    for (const w of misspelled) {
      newResults.push({
        wordId: w.id,
        word: w.text,
        expected: w.text,
        firstAttempt,
        secondAttempt: userInput,
        score: 0,
        state: 'final',
      });
    }

    // Words from first attempt that were correct but not in second attempt
    const firstUsed = roundUsed.filter(w => !roundMisspelled.includes(w));
    for (const w of firstUsed) {
      if (!used.some(u => u.id === w.id)) {
        // Word was removed from sentence, still count from first attempt
        newResults.push({
          wordId: w.id,
          word: w.text,
          expected: w.text,
          firstAttempt,
          secondAttempt: userInput,
          score: 0.5,
          state: 'final',
        });
      }
    }

    setResults(prev => [...prev, ...newResults]);
    setRoundUsed(used);
    setRoundMisspelled(misspelled);
    setState('final');
  };

  const handleNext = () => {
    // Remove all used words (correctly spelled ones) from remaining
    const usedIds = new Set(roundUsed.filter(w => !roundMisspelled.some(m => m.id === w.id)).map(w => w.id));
    // Also remove words scored in this round
    const scoredIds = new Set(results.filter(r => r.state === 'final').map(r => r.wordId));
    
    const newRemaining = remainingWords.filter(w => !scoredIds.has(w.id));

    if (newRemaining.length === 0) {
      finishExercise();
      return;
    }

    setRemainingWords(newRemaining);
    setUserInput('');
    setState('pending');
    setFirstAttempt('');
    setRoundMisspelled([]);
    setRoundUsed([]);
    setRoundNumber(prev => prev + 1);
  };

  const finishExercise = () => {
    const allResults = [...results];
    const totalScore = allResults.reduce((sum, r) => sum + r.score, 0);
    const maxScore = allResults.length;
    const session: DictationSession = {
      id: generateId(),
      date: new Date().toISOString(),
      level: 2,
      listId: list.id,
      listName: list.name,
      results: allResults,
      totalScore,
      maxScore: maxScore || 1,
      percentage: Math.round((totalScore / (maxScore || 1)) * 100),
    };
    saveSession(session);
    onFinish(session);
    setIsFinished(true);
  };

  if (isFinished) return null;

  const progress = ((totalWords - remainingWords.length) / totalWords) * 100;
  const lastRoundScore = state === 'final'
    ? roundUsed.filter(w => !roundMisspelled.some(m => m.id === w.id)).length
    : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn-playful bg-muted text-muted-foreground text-sm py-2 px-4">
          <Home size={16} /> Retour
        </button>
        <div className="text-center">
          <span className="text-sm text-muted-foreground font-body">📗 Niveau 2 — Phrases libres</span>
          <h3 className="font-display text-lg text-foreground">{list.name}</h3>
        </div>
        <span className="text-sm font-body text-muted-foreground">
          Tour {roundNumber}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      {/* Word pool */}
      <motion.div
        key={`pool-${roundNumber}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-playful"
      >
        <p className="text-sm text-muted-foreground font-body mb-3">
          📝 Écris une phrase avec le plus de mots possible :
        </p>
        <div className="flex flex-wrap gap-2">
          {remainingWords.map(word => (
            <button
              key={word.id}
              onClick={() => handleSpeakWord(word.text)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-secondary-foreground font-body text-sm font-semibold hover:bg-secondary/80 transition-colors cursor-pointer"
            >
              <Volume2 size={14} />
              {word.text}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Input area */}
      <motion.div
        key={`input-${roundNumber}`}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        className="card-playful space-y-4"
      >
        <textarea
          value={userInput}
          onChange={e => setUserInput(e.target.value)}
          placeholder="Écris ta phrase ici..."
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          rows={3}
          className={`w-full rounded-xl px-5 py-4 text-lg font-body focus:outline-none focus:ring-3 transition-colors resize-none ${
            state === 'final'
              ? roundMisspelled.length === 0
                ? 'bg-success/10 ring-2 ring-success text-success'
                : 'bg-destructive/10 ring-2 ring-destructive text-foreground'
              : state === 'correcting'
                ? 'bg-warning/10 ring-2 ring-warning text-foreground'
                : 'bg-muted text-foreground focus:ring-primary'
          }`}
          disabled={state === 'final'}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (state === 'pending') handleFirstValidation();
              else if (state === 'correcting') handleSecondValidation();
            }
          }}
          autoFocus
        />

        {/* Feedback */}
        <AnimatePresence>
          {state === 'correcting' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl bg-warning/10 border border-warning/30 p-4 space-y-2"
            >
              {roundUsed.length === 0 ? (
                <p className="text-sm font-semibold text-warning-foreground">⚠️ Utilise au moins un mot de la liste ! Réessaie.</p>
              ) : roundMisspelled.length > 0 ? (
                <>
                  <p className="text-sm font-semibold text-warning-foreground">⚠️ Certains mots sont mal orthographiés. Corrige et réessaie.</p>
                  <HighlightedSentence sentence={userInput} misspelledWords={roundMisspelled} />
                </>
              ) : (
                <p className="text-sm font-semibold text-warning-foreground">⚠️ Pas tout à fait ! Corrige et réessaie.</p>
              )}
            </motion.div>
          )}

          {state === 'final' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl p-4 border ${
                roundMisspelled.length === 0
                  ? 'bg-success/10 border-success/30'
                  : 'bg-destructive/10 border-destructive/30'
              }`}
            >
              {roundMisspelled.length === 0 && roundUsed.length > 0 ? (
                <p className="text-success font-bold text-lg">
                  🎉 {roundUsed.length > 1 ? `${roundUsed.length} mots utilisés correctement !` : 'Bravo ! Mot bien utilisé !'}
                </p>
              ) : roundMisspelled.length > 0 ? (
                <div>
                  <p className="text-destructive font-bold mb-2">❌ Certains mots restent incorrects :</p>
                  <div className="flex flex-wrap gap-2">
                    {roundMisspelled.map(w => (
                      <span key={w.id} className="px-2 py-1 rounded bg-destructive/20 text-destructive font-bold text-sm">
                        {w.text}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-destructive font-bold">❌ Aucun mot de la liste n'a été trouvé.</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Mots restants : {remainingWords.length - (roundUsed.filter(w => !roundMisspelled.some(m => m.id === w.id)).length)}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex justify-center gap-3">
          {state === 'pending' && (
            <button onClick={handleFirstValidation} className="btn-playful bg-primary text-primary-foreground">
              <Check size={20} /> Valider
            </button>
          )}
          {state === 'correcting' && (
            <button onClick={handleSecondValidation} className="btn-playful bg-accent text-accent-foreground">
              <RotateCcw size={20} /> Revalider
            </button>
          )}
          {state === 'final' && (
            <button onClick={handleNext} className="btn-playful bg-primary text-primary-foreground">
              {remainingWords.length - (roundUsed.filter(w => !roundMisspelled.some(m => m.id === w.id)).length) <= 0
                ? '🏁 Terminer'
                : <><ArrowRight size={20} /> Suivant</>
              }
            </button>
          )}
        </div>
      </motion.div>

      {/* Running score */}
      {results.length > 0 && (
        <div className="text-center text-sm text-muted-foreground font-body">
          Score en cours : {results.reduce((s, r) => s + r.score, 0)}/{results.length}
        </div>
      )}
    </div>
  );
}
