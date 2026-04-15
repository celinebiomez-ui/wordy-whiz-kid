import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Check, ArrowRight, RotateCcw, Home } from 'lucide-react';
import { DictationList, DictationWord, WordResult, DictationSession, ValidationState } from '@/lib/types';
import { useSpeech } from '@/hooks/useSpeech';
import { saveSession } from '@/lib/storage';
import { generatePhrases, shuffle, GeneratedPhrase } from '@/lib/phraseGenerator';
import WordDiff from '@/components/WordDiff';

interface Props {
  list: DictationList;
  level: 1 | 2;
  onFinish: (session: DictationSession) => void;
  onBack: () => void;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function DictationExercise({ list, level, onFinish, onBack }: Props) {
  const { speak } = useSpeech();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [state, setState] = useState<ValidationState>('pending');
  const [results, setResults] = useState<WordResult[]>([]);
  const [showCorrection, setShowCorrection] = useState(false);
  const [firstAttempt, setFirstAttempt] = useState('');
  const [isFinished, setIsFinished] = useState(false);

  // Shuffle words for level 1, generate phrases for level 2
  const [shuffledWords] = useState(() => shuffle(list.words.map(w => ({
    ...w,
    wordType: w.wordType || (w.isVerb ? 'verbe' : 'autre'),
    isVerb: w.isVerb ?? false,
  }))));
  const [phrases] = useState<GeneratedPhrase[]>(() => {
    try {
      return level === 2 ? generatePhrases(list.words.map(w => ({
        ...w,
        wordType: w.wordType || (w.isVerb ? 'verbe' : 'autre'),
        isVerb: w.isVerb ?? false,
      }))) : [];
    } catch (e) {
      console.error('Error generating phrases:', e);
      return [];
    }
  });

  // For level 1: use shuffled words. For level 2: use phrases.
  const totalItems = level === 1 ? shuffledWords.length : phrases.length;

  const currentWord = level === 1 ? shuffledWords[currentIndex] : null;
  const currentPhrase = level === 2 ? phrases[currentIndex] : null;

  const expectedText = level === 2
    ? currentPhrase?.phrase || ''
    : currentWord?.text || '';

  const displayText = level === 2
    ? currentPhrase?.phrase || ''
    : currentWord?.isVerb && currentWord?.tense
      ? `${currentWord.text} (${currentWord.tense})`
      : currentWord?.text || '';

  const handleSpeak = useCallback(() => {
    if (expectedText) speak(expectedText);
  }, [expectedText, speak]);

  // Auto-speak on new word
  useEffect(() => {
    if (state === 'pending' && expectedText) {
      const t = setTimeout(() => handleSpeak(), 50);
      return () => clearTimeout(t);
    }
  }, [currentIndex, state]);

  // Global Enter key handler for when input is disabled (final state)
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
  }, [state, currentIndex, results]);

  const handleFirstValidation = () => {
    if (!userInput.trim()) return;
    setFirstAttempt(userInput);

    if (normalize(userInput) === normalize(expectedText)) {
      const result: WordResult = {
        wordId: currentWord?.id || currentPhrase?.wordIds[0] || '',
        word: displayText,
        expected: expectedText,
        firstAttempt: userInput,
        score: 1,
        state: 'final',
      };
      setResults(prev => [...prev, result]);
      setState('final');
      setShowCorrection(false);
    } else {
      setState('correcting');
      setShowCorrection(true);
    }
  };

  const handleSecondValidation = () => {
    if (!userInput.trim()) return;
    const isCorrect = normalize(userInput) === normalize(expectedText);
    const result: WordResult = {
      wordId: currentWord?.id || currentPhrase?.wordIds[0] || '',
      word: displayText,
      expected: expectedText,
      firstAttempt,
      secondAttempt: userInput,
      score: isCorrect ? 0.5 : 0,
      state: 'final',
    };
    setResults(prev => [...prev, result]);
    setState('final');
    setShowCorrection(!isCorrect);
  };

  const handleNext = () => {
    if (currentIndex + 1 >= totalItems) {
      const allResults = [...results];
      const totalScore = allResults.reduce((sum, r) => sum + r.score, 0);
      const maxScore = allResults.length;
      const session: DictationSession = {
        id: generateId(),
        date: new Date().toISOString(),
        level,
        listId: list.id,
        listName: list.name,
        results: allResults,
        totalScore,
        maxScore,
        percentage: Math.round((totalScore / maxScore) * 100),
      };
      saveSession(session);
      onFinish(session);
      setIsFinished(true);
      return;
    }
    setCurrentIndex(prev => prev + 1);
    setUserInput('');
    setState('pending');
    setShowCorrection(false);
    setFirstAttempt('');
  };

  const lastResult = results[results.length - 1];

  if (isFinished) return null;

  if (totalItems === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12 space-y-4">
        <p className="text-5xl">⚠️</p>
        <p className="text-lg text-muted-foreground font-body">Cette liste ne contient pas assez de mots pour lancer l'exercice.</p>
        <button onClick={onBack} className="btn-playful bg-primary text-primary-foreground">
          <Home size={16} /> Retour aux listes
        </button>
      </div>
    );
  }

  const progress = (currentIndex / totalItems) * 100;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn-playful bg-muted text-muted-foreground text-sm py-2 px-4">
          <Home size={16} /> Retour
        </button>
        <div className="text-center">
          <span className="text-sm text-muted-foreground font-body">
            {level === 1 ? '📘 Niveau 1 — Mots' : '📗 Niveau 2 — Phrases'}
          </span>
          <h3 className="font-display text-lg text-foreground">{list.name}</h3>
        </div>
        <span className="text-sm font-body text-muted-foreground">
          {currentIndex + 1}/{totalItems}
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

      {/* Exercise card */}
      <motion.div
        key={currentIndex}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        className="card-playful space-y-6"
      >
        {/* Speaker button */}
        <div className="text-center">
          <button
            onClick={handleSpeak}
            className="btn-playful bg-secondary text-secondary-foreground text-xl px-8 py-4 rounded-2xl"
          >
            <Volume2 size={28} /> Écouter
          </button>
          {currentWord?.isVerb && currentWord?.tense && state === 'pending' && (
            <p className="mt-3 text-sm text-accent font-semibold">
              🔤 Conjugue au {currentWord.tense}
            </p>
          )}
        </div>

        {/* Input */}
        <div className="space-y-3">
          <input
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            placeholder="Écris ta réponse ici..."
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            className={`w-full rounded-xl px-5 py-4 text-lg font-body focus:outline-none focus:ring-3 transition-colors ${
              state === 'final' && lastResult
                ? lastResult.score === 1
                  ? 'bg-success/10 ring-2 ring-success text-success'
                  : lastResult.score === 0.5
                    ? 'bg-success/10 ring-2 ring-success text-success'
                    : 'bg-destructive/10 ring-2 ring-destructive text-foreground'
                : state === 'correcting'
                  ? 'bg-warning/10 ring-2 ring-warning text-foreground'
                  : 'bg-muted text-foreground focus:ring-primary'
            }`}
            disabled={state === 'final'}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (state === 'pending') handleFirstValidation();
                else if (state === 'correcting') handleSecondValidation();
              }
            }}
            autoFocus
          />

          {/* Correction display */}
          <AnimatePresence>
            {state === 'correcting' && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl bg-warning/10 border border-warning/30 p-4"
              >
                <p className="text-sm font-semibold text-warning-foreground">⚠️ Pas tout à fait ! Corrige et réessaie.</p>
              </motion.div>
            )}

            {state === 'final' && lastResult && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl p-4 border ${
                  lastResult.score > 0
                    ? 'bg-success/10 border-success/30'
                    : 'bg-destructive/10 border-destructive/30'
                }`}
              >
                {lastResult.score === 1 && (
                  <p className="text-success font-bold text-lg">🎉 Bravo ! Parfait du premier coup !</p>
                )}
                {lastResult.score === 0.5 && (
                  <p className="text-success font-bold">✅ Bien corrigé ! Continue comme ça !</p>
                )}
                {lastResult.score === 0 && (
                  <div>
                    <p className="text-destructive font-bold mb-2">❌ Pas cette fois...</p>
                    <p className="text-sm text-foreground mb-1">Réponse correcte :</p>
                    <WordDiff expected={expectedText} attempt={lastResult.secondAttempt || lastResult.firstAttempt} />
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Score : {lastResult.score === 1 ? '⭐ 1 point' : lastResult.score === 0.5 ? '½ point' : '0 point'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

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
              {currentIndex + 1 >= totalItems ? '🏁 Terminer' : <><ArrowRight size={20} /> Suivant</>}
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
