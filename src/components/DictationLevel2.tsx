import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Check, ArrowRight, RotateCcw, Home, Loader2 } from 'lucide-react';
import { DictationList, DictationWord, WordResult, DictationSession, ValidationState } from '@/lib/types';
import { useSpeech } from '@/hooks/useSpeech';
import { saveSession } from '@/lib/storage';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  list: DictationList;
  onFinish: (session: DictationSession) => void;
  onBack: () => void;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

interface PhraseError {
  wrong: string;
  correct: string;
  type: string;
}

interface TargetWordStatus {
  word: string;
  found: boolean;
  correct: boolean;
}

interface CheckResult {
  correctedPhrase: string;
  errors: PhraseError[];
  targetWordsStatus: TargetWordStatus[];
}

/** Highlight errors in the sentence */
function HighlightedSentence({ sentence, errors, showCorrections }: { sentence: string; errors: PhraseError[]; showCorrections: boolean }) {
  if (errors.length === 0) {
    return <p className="text-sm font-body leading-relaxed text-foreground">{sentence}</p>;
  }

  // Build a highlighted version by replacing wrong words
  let result = sentence;
  const parts: { text: string; isError: boolean; correct?: string }[] = [];

  // Simple approach: split into words, match against errors
  const words = sentence.split(/(\s+)/); // keep whitespace

  return (
    <p className="text-sm font-body leading-relaxed">
      {words.map((segment, i) => {
        if (/^\s+$/.test(segment)) {
          return <span key={i}>{segment}</span>;
        }
        // Strip punctuation for matching
        const clean = segment.toLowerCase().replace(/[.,!?;:'"()]+/g, '');
        const error = errors.find(e => e.wrong.toLowerCase() === clean);
        if (error) {
          return (
            <span key={i} className="text-destructive font-bold underline" title={showCorrections ? `→ ${error.correct} (${error.type})` : undefined}>
              {segment}
              {showCorrections && (
                <span className="text-success font-normal no-underline ml-1">({error.correct})</span>
              )}
            </span>
          );
        }
        return <span key={i} className="text-foreground">{segment}</span>;
      })}
    </p>
  );
}

async function checkPhrase(phrase: string, targetWords: string[]): Promise<CheckResult> {
  const { data, error } = await supabase.functions.invoke('check-phrase', {
    body: { phrase, targetWords },
  });

  if (error) {
    throw new Error(error.message || 'Erreur lors de la vérification');
  }

  return data as CheckResult;
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
  const [isFinished, setIsFinished] = useState(false);
  const [roundNumber, setRoundNumber] = useState(1);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<CheckResult | null>(null);
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

  const doCheck = async (input: string): Promise<CheckResult | null> => {
    setIsChecking(true);
    try {
      const targetWordTexts = remainingWords.map(w => w.text);
      const result = await checkPhrase(input, targetWordTexts);
      setLastCheckResult(result);
      return result;
    } catch (e) {
      console.error('Check error:', e);
      toast.error("Erreur lors de la vérification. Réessaie.");
      return null;
    } finally {
      setIsChecking(false);
    }
  };

  const handleFirstValidation = async () => {
    if (!userInput.trim() || isChecking) return;
    setFirstAttempt(userInput);

    const result = await doCheck(userInput);
    if (!result) return;

    const usedWords = result.targetWordsStatus.filter(t => t.found);

    if (usedWords.length === 0) {
      setState('correcting');
      toast.warning("Utilise au moins un mot de la liste !");
      return;
    }

    if (result.errors.length === 0) {
      // Perfect! All words correct
      const newResults = usedWords
        .filter(t => t.correct)
        .map(t => {
          const word = remainingWords.find(w => w.text.toLowerCase() === t.word.toLowerCase());
          return {
            wordId: word?.id || '',
            word: t.word,
            expected: t.word,
            firstAttempt: userInput,
            score: 1,
            state: 'final' as ValidationState,
          };
        });
      setResults(prev => [...prev, ...newResults]);
      setState('final');
    } else {
      // Errors found - show them but don't give corrections
      setState('correcting');
    }
  };

  const handleSecondValidation = async () => {
    if (!userInput.trim() || isChecking) return;

    const result = await doCheck(userInput);
    if (!result) return;

    const usedWords = result.targetWordsStatus.filter(t => t.found);
    const newResults: WordResult[] = [];

    for (const t of usedWords) {
      const word = remainingWords.find(w => w.text.toLowerCase() === t.word.toLowerCase());
      if (!word) continue;

      if (t.correct && result.errors.length === 0) {
        // Corrected on second attempt
        newResults.push({
          wordId: word.id,
          word: t.word,
          expected: t.word,
          firstAttempt,
          secondAttempt: userInput,
          score: 0.5,
          state: 'final',
        });
      } else if (t.correct) {
        // Word itself is correct but phrase has other errors
        newResults.push({
          wordId: word.id,
          word: t.word,
          expected: t.word,
          firstAttempt,
          secondAttempt: userInput,
          score: result.errors.length === 0 ? 0.5 : 0.5,
          state: 'final',
        });
      } else {
        // Word still misspelled
        newResults.push({
          wordId: word.id,
          word: t.word,
          expected: t.word,
          firstAttempt,
          secondAttempt: userInput,
          score: 0,
          state: 'final',
        });
      }
    }

    setResults(prev => [...prev, ...newResults]);
    setState('final');
  };

  const handleNext = () => {
    // Remove words that were found and correctly used
    const correctWordTexts = new Set(
      (lastCheckResult?.targetWordsStatus || [])
        .filter(t => t.found && t.correct)
        .map(t => t.word.toLowerCase())
    );

    const newRemaining = remainingWords.filter(w => !correctWordTexts.has(w.text.toLowerCase()));

    if (newRemaining.length === 0) {
      finishExercise();
      return;
    }

    setRemainingWords(newRemaining);
    setUserInput('');
    setState('pending');
    setFirstAttempt('');
    setLastCheckResult(null);
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
  const hasErrors = lastCheckResult && lastCheckResult.errors.length > 0;

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
          📝 Écris une ou plusieurs phrases avec le plus de mots possible :
        </p>
        <div className="flex flex-wrap gap-2">
          {remainingWords.map(word => (
            <button
              key={word.id}
              onClick={() => handleSpeakWord(word.text)}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors cursor-pointer"
              title="Écouter le mot"
            >
              <Volume2 size={18} />
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
              ? !hasErrors
                ? 'bg-success/10 ring-2 ring-success text-success'
                : 'bg-destructive/10 ring-2 ring-destructive text-foreground'
              : state === 'correcting'
                ? 'bg-warning/10 ring-2 ring-warning text-foreground'
                : 'bg-muted text-foreground focus:ring-primary'
          }`}
          disabled={state === 'final' || isChecking}
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
          {state === 'correcting' && lastCheckResult && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl bg-warning/10 border border-warning/30 p-4 space-y-2"
            >
              {lastCheckResult.targetWordsStatus.filter(t => t.found).length === 0 ? (
                <p className="text-sm font-semibold text-warning-foreground">⚠️ Utilise au moins un mot de la liste ! Réessaie.</p>
              ) : lastCheckResult.errors.length > 0 ? (
                <>
                  <p className="text-sm font-semibold text-warning-foreground">
                    ⚠️ Il y a {lastCheckResult.errors.length} erreur{lastCheckResult.errors.length > 1 ? 's' : ''} dans ta phrase. Corrige et réessaie.
                  </p>
                  <HighlightedSentence sentence={userInput} errors={lastCheckResult.errors} showCorrections={false} />
                </>
              ) : (
                <p className="text-sm font-semibold text-warning-foreground">⚠️ Pas tout à fait ! Corrige et réessaie.</p>
              )}
            </motion.div>
          )}

          {state === 'final' && lastCheckResult && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl p-4 border ${
                !hasErrors
                  ? 'bg-success/10 border-success/30'
                  : 'bg-destructive/10 border-destructive/30'
              }`}
            >
              {!hasErrors ? (
                <div>
                  <p className="text-success font-bold text-lg">
                    🎉 {lastCheckResult.targetWordsStatus.filter(t => t.found && t.correct).length > 1
                      ? `${lastCheckResult.targetWordsStatus.filter(t => t.found && t.correct).length} mots utilisés correctement !`
                      : 'Bravo ! Mot bien utilisé !'
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-destructive font-bold mb-2">❌ Certaines erreurs restent :</p>
                  <HighlightedSentence sentence={userInput} errors={lastCheckResult.errors} showCorrections={true} />
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground">Correction : {lastCheckResult.correctedPhrase}</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Mots restants : {remainingWords.length - (lastCheckResult.targetWordsStatus.filter(t => t.found && t.correct).length)}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex justify-center gap-3">
          {state === 'pending' && (
            <button onClick={handleFirstValidation} disabled={isChecking} className="btn-playful bg-primary text-primary-foreground">
              {isChecking ? <><Loader2 size={20} className="animate-spin" /> Vérification...</> : <><Check size={20} /> Valider</>}
            </button>
          )}
          {state === 'correcting' && (
            <button onClick={handleSecondValidation} disabled={isChecking} className="btn-playful bg-accent text-accent-foreground">
              {isChecking ? <><Loader2 size={20} className="animate-spin" /> Vérification...</> : <><RotateCcw size={20} /> Revalider</>}
            </button>
          )}
          {state === 'final' && (
            <button onClick={handleNext} className="btn-playful bg-primary text-primary-foreground">
              {remainingWords.length - (lastCheckResult?.targetWordsStatus.filter(t => t.found && t.correct).length || 0) <= 0
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
