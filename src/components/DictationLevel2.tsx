import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Check, ArrowRight, RotateCcw, Home, Loader2 } from 'lucide-react';
import { DictationList, WordResult, DictationSession, ValidationState } from '@/lib/types';
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

/** Normalise un texte pour comparaison : minuscules, sans ponctuation, espaces simples. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire accents pour comparaison souple
    .replace(/[.,!?;:'"«»()\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokenize en gardant les mots et leur version normalisée */
function tokenize(text: string): { raw: string; norm: string }[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(raw => ({
      raw,
      norm: raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.,!?;:'"«»()\-–—]+/g, ''),
    }));
}

interface WordDiff {
  expected: string;
  got: string;
  ok: boolean;
}

/** Compare mot à mot (tolère accents, casse, ponctuation). */
function diffTexts(expected: string, got: string): { diffs: WordDiff[]; correctCount: number; total: number; allCorrect: boolean } {
  const exp = tokenize(expected);
  const g = tokenize(got);
  const max = Math.max(exp.length, g.length);
  const diffs: WordDiff[] = [];
  let correctCount = 0;
  for (let i = 0; i < max; i++) {
    const e = exp[i];
    const gi = g[i];
    const ok = !!(e && gi && e.norm === gi.norm);
    if (ok) correctCount++;
    diffs.push({
      expected: e?.raw || '',
      got: gi?.raw || '',
      ok,
    });
  }
  return { diffs, correctCount, total: exp.length, allCorrect: correctCount === exp.length && g.length === exp.length };
}

export default function DictationLevel2({ list, onFinish, onBack }: Props) {
  const { speak } = useSpeech();
  const [passages, setPassages] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [state, setState] = useState<ValidationState>('pending');
  const [firstAttempt, setFirstAttempt] = useState('');
  const [lastDiff, setLastDiff] = useState<ReturnType<typeof diffTexts> | null>(null);
  const [results, setResults] = useState<WordResult[]>([]);
  const spokenRef = useRef(false);

  // Charger les passages depuis l'IA au montage
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('generate-dictation-passages', {
          body: { words: list.words.map(w => w.text) },
        });
        if (cancelled) return;
        if (error) throw new Error(error.message);
        const p: string[] = data?.passages || [];
        if (p.length === 0) throw new Error('Aucun passage généré');
        setPassages(p);
      } catch (e) {
        console.error('Erreur génération passages:', e);
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [list.id]);

  const currentPassage = passages?.[currentIdx] || '';

  const handleSpeak = useCallback(() => {
    if (!currentPassage) return;
    speak(currentPassage, 0.8);
  }, [currentPassage, speak]);

  // Lecture automatique du passage dès qu'il est prêt
  useEffect(() => {
    if (passages && currentPassage && state === 'pending') {
      if (!spokenRef.current) {
        spokenRef.current = true;
        handleSpeak();
      }
    }
  }, [passages, currentPassage, state, handleSpeak]);

  const handleFirstValidation = () => {
    if (!userInput.trim() || !currentPassage) return;
    setFirstAttempt(userInput);
    const diff = diffTexts(currentPassage, userInput);
    setLastDiff(diff);

    if (diff.allCorrect) {
      // Parfait du premier coup → 1pt
      setResults(prev => [...prev, {
        wordId: `p${currentIdx}`,
        word: `Passage ${currentIdx + 1}`,
        expected: currentPassage,
        firstAttempt: userInput,
        score: 1,
        state: 'final',
      }]);
      setState('final');
    } else {
      setState('correcting');
    }
  };

  const handleSecondValidation = () => {
    if (!userInput.trim() || !currentPassage) return;
    const diff = diffTexts(currentPassage, userInput);
    setLastDiff(diff);

    const score = diff.allCorrect ? 0.5 : 0;
    setResults(prev => [...prev, {
      wordId: `p${currentIdx}`,
      word: `Passage ${currentIdx + 1}`,
      expected: currentPassage,
      firstAttempt,
      secondAttempt: userInput,
      score,
      state: 'final',
    }]);
    setState('final');
  };

  const handleNext = () => {
    if (!passages) return;
    if (currentIdx + 1 >= passages.length) {
      // Fin
      const totalScore = results.reduce((s, r) => s + r.score, 0);
      const maxScore = results.length || 1;
      const session: DictationSession = {
        id: generateId(),
        date: new Date().toISOString(),
        level: 2,
        listId: list.id,
        listName: list.name,
        results,
        totalScore,
        maxScore,
        percentage: Math.round((totalScore / maxScore) * 100),
      };
      saveSession(session);
      onFinish(session);
      return;
    }
    setCurrentIdx(prev => prev + 1);
    setUserInput('');
    setFirstAttempt('');
    setLastDiff(null);
    setState('pending');
    spokenRef.current = false;
  };

  // Enter global en état final
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
  }, [state, currentIdx, results, passages]);

  // États de chargement / erreur
  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12 space-y-4">
        <p className="text-5xl">😕</p>
        <p className="text-foreground font-body">Impossible de générer la dictée : {loadError}</p>
        <button onClick={onBack} className="btn-playful bg-primary text-primary-foreground">
          <Home size={18} /> Retour
        </button>
      </div>
    );
  }

  if (!passages) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12 space-y-4">
        <Loader2 size={48} className="animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground font-body">✨ L'IA prépare ta dictée...</p>
      </div>
    );
  }

  const progress = ((currentIdx + (state === 'final' ? 1 : 0)) / passages.length) * 100;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn-playful bg-muted text-muted-foreground text-sm py-2 px-4">
          <Home size={16} /> Retour
        </button>
        <div className="text-center">
          <span className="text-sm text-muted-foreground font-body">📗 Niveau 2 — Dictée IA</span>
          <h3 className="font-display text-lg text-foreground">{list.name}</h3>
        </div>
        <span className="text-sm font-body text-muted-foreground">
          {currentIdx + 1} / {passages.length}
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

      {/* Bouton lecture */}
      <motion.div
        key={`listen-${currentIdx}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-playful flex flex-col items-center gap-4 py-8"
      >
        <p className="text-sm text-muted-foreground font-body">
          🎧 Écoute le passage et écris-le
        </p>
        <button
          onClick={handleSpeak}
          className="btn-playful bg-primary text-primary-foreground text-lg px-8 py-4"
          title="Réécouter le passage"
        >
          <Volume2 size={24} /> Réécouter
        </button>
      </motion.div>

      {/* Zone de saisie */}
      <motion.div
        key={`input-${currentIdx}`}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        className="card-playful space-y-4"
      >
        <textarea
          value={userInput}
          onChange={e => setUserInput(e.target.value)}
          placeholder="Écris ici ce que tu entends..."
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          rows={4}
          className={`w-full rounded-xl px-5 py-4 text-lg font-body focus:outline-none focus:ring-3 transition-colors resize-none ${
            state === 'final'
              ? lastDiff?.allCorrect
                ? 'bg-success/10 ring-2 ring-success text-foreground'
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
          {state === 'correcting' && lastDiff && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl bg-warning/10 border border-warning/30 p-4 space-y-2"
            >
              <p className="text-sm font-semibold text-warning-foreground">
                ⚠️ {lastDiff.correctCount}/{lastDiff.total} mots corrects. Réécoute et corrige !
              </p>
              <p className="text-sm font-body leading-relaxed">
                {lastDiff.diffs.map((d, i) => (
                  <span key={i}>
                    <span className={d.ok ? 'text-success' : 'text-destructive font-bold underline'}>
                      {d.got || '_____'}
                    </span>
                    {i < lastDiff.diffs.length - 1 && ' '}
                  </span>
                ))}
              </p>
            </motion.div>
          )}

          {state === 'final' && lastDiff && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl p-4 border ${
                lastDiff.allCorrect
                  ? 'bg-success/10 border-success/30'
                  : 'bg-destructive/10 border-destructive/30'
              }`}
            >
              {lastDiff.allCorrect ? (
                <p className="text-success font-bold text-lg">🎉 Bravo ! Parfait !</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-destructive font-bold mb-2">❌ Corrige avec la bonne version :</p>
                  <p className="text-sm text-muted-foreground">Correction :</p>
                  <p className="text-sm font-body leading-relaxed text-foreground bg-card rounded-lg p-3">
                    {currentPassage}
                  </p>
                </div>
              )}
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
              {currentIdx + 1 >= passages.length
                ? '🏁 Terminer'
                : <><ArrowRight size={20} /> Suivant</>
              }
            </button>
          )}
        </div>
      </motion.div>

      {/* Score en cours */}
      {results.length > 0 && (
        <div className="text-center text-sm text-muted-foreground font-body">
          Score en cours : {results.reduce((s, r) => s + r.score, 0)}/{results.length}
        </div>
      )}
    </div>
  );
}
