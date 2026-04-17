import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Edit2, BookOpen, X, Save, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { DictationList, DictationWord } from '@/lib/types';
import { getLists, saveList, deleteList } from '@/lib/storage';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  onStartExercise: (list: DictationList, level: 1 | 2) => void;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

interface SpellCheckResult {
  original: string;
  correct: boolean;
  suggestion: string | null;
}

export default function ListManager({ onStartExercise }: Props) {
  const [lists, setLists] = useState<DictationList[]>([]);
  const [editing, setEditing] = useState<DictationList | null>(null);
  const [newWordText, setNewWordText] = useState('');
  const [newListName, setNewListName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [spellResults, setSpellResults] = useState<SpellCheckResult[] | null>(null);

  const refresh = async () => {
    const data = await getLists();
    setLists(data);
  };

  useEffect(() => {
    refresh();
    // Realtime: synchro entre ordinateurs
    const channel = supabase
      .channel('dictation-lists-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dictation_lists' }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    const list: DictationList = {
      id: generateId(),
      name: newListName.trim(),
      words: [],
      createdAt: new Date().toISOString(),
    };
    await saveList(list);
    setNewListName('');
    setShowCreate(false);
    setEditing(list);
    await refresh();
  };

  const handleDeleteList = async (id: string) => {
    await deleteList(id);
    await refresh();
  };

  const handleAddWord = async () => {
    if (!editing || !newWordText.trim()) return;
    const word: DictationWord = {
      id: generateId(),
      text: newWordText.trim(),
      wordType: 'autre',
      isVerb: false,
    };
    const updated = { ...editing, words: [...editing.words, word] };
    await saveList(updated);
    setEditing(updated);
    setNewWordText('');
    setSpellResults(null);
    await refresh();
  };

  const handleRemoveWord = async (wordId: string) => {
    if (!editing) return;
    const updated = { ...editing, words: editing.words.filter(w => w.id !== wordId) };
    await saveList(updated);
    setEditing(updated);
    setSpellResults(null);
    await refresh();
  };

  const handleApplySuggestion = async (original: string, suggestion: string) => {
    if (!editing) return;
    const updated = {
      ...editing,
      words: editing.words.map(w =>
        w.text === original ? { ...w, text: suggestion } : w
      ),
    };
    await saveList(updated);
    setEditing(updated);
    setSpellResults(prev =>
      prev ? prev.map(r => r.original === original ? { ...r, original: suggestion, correct: true, suggestion: null } : r) : null
    );
    await refresh();
  };

  const handleSaveAndCheck = async () => {
    if (!editing || editing.words.length === 0) {
      toast.warning("Ajoute au moins un mot avant d'enregistrer !");
      return;
    }

    setIsChecking(true);
    setSpellResults(null);

    try {
      const wordTexts = editing.words.map(w => w.text);
      const { data, error } = await supabase.functions.invoke('check-words', {
        body: { words: wordTexts },
      });

      if (error) throw new Error(error.message);

      const results: SpellCheckResult[] = data.results || [];
      setSpellResults(results);

      const errors = results.filter(r => !r.correct);
      if (errors.length === 0) {
        toast.success("✅ Tous les mots sont correctement orthographiés !");
      } else {
        toast.warning(`⚠️ ${errors.length} mot(s) à corriger`);
      }
    } catch (e) {
      console.error('Spell check error:', e);
      toast.error("Erreur lors de la vérification. Liste enregistrée sans vérification.");
    } finally {
      setIsChecking(false);
    }
  };

  const getSpellStatus = (wordText: string): SpellCheckResult | undefined => {
    return spellResults?.find(r => r.original === wordText);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display text-foreground">📚 Mes listes</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-playful bg-primary text-primary-foreground"
        >
          <Plus size={20} /> Nouvelle liste
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="card-playful flex gap-3"
          >
            <input
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              placeholder="Nom de la liste..."
              className="flex-1 rounded-xl bg-muted px-4 py-3 font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={e => e.key === 'Enter' && handleCreateList()}
              autoFocus
            />
            <button onClick={handleCreateList} className="btn-playful bg-success text-success-foreground">
              <Save size={18} />
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-playful bg-muted text-muted-foreground">
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editing panel */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="card-playful space-y-4 border-2 border-primary/30"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-display text-foreground">✏️ {editing.name}</h3>
              <button onClick={() => { setEditing(null); setSpellResults(null); }} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            {/* Word list */}
            <div className="space-y-2">
              {editing.words.map(word => {
                const spellStatus = getSpellStatus(word.text);
                return (
                  <div key={word.id} className={`flex items-center gap-3 rounded-xl px-4 py-2 ${
                    spellStatus && !spellStatus.correct
                      ? 'bg-destructive/10 border border-destructive/30'
                      : spellStatus?.correct
                        ? 'bg-success/10 border border-success/30'
                        : 'bg-muted/50'
                  }`}>
                    <span className="flex-1 font-body text-foreground flex items-center gap-2">
                      {word.text}
                      {spellStatus && !spellStatus.correct && spellStatus.suggestion && (
                        <button
                          onClick={() => handleApplySuggestion(word.text, spellStatus.suggestion!)}
                          className="text-xs rounded-lg bg-primary/20 text-primary px-2 py-1 hover:bg-primary/30 transition-colors"
                        >
                          → {spellStatus.suggestion}
                        </button>
                      )}
                      {spellStatus?.correct && (
                        <CheckCircle size={16} className="text-success" />
                      )}
                      {spellStatus && !spellStatus.correct && (
                        <AlertTriangle size={16} className="text-destructive" />
                      )}
                    </span>
                    <button onClick={() => handleRemoveWord(word.id)} className="text-destructive hover:text-destructive/80">
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
              {editing.words.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Aucun mot. Ajoutez-en ci-dessous !</p>
              )}
            </div>

            {/* Add word form */}
            <div className="flex gap-3 rounded-xl bg-muted/30 p-4">
              <input
                value={newWordText}
                onChange={e => setNewWordText(e.target.value)}
                placeholder="Ajouter un mot..."
                className="flex-1 rounded-xl bg-card px-4 py-3 font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={e => e.key === 'Enter' && handleAddWord()}
                spellCheck={false}
              />
              <button onClick={handleAddWord} className="btn-playful bg-primary text-primary-foreground text-sm">
                <Plus size={18} /> Ajouter
              </button>
            </div>

            {/* Save & check button */}
            {editing.words.length > 0 && (
              <button
                onClick={handleSaveAndCheck}
                disabled={isChecking}
                className="btn-playful bg-success text-success-foreground w-full justify-center text-base py-3"
              >
                {isChecking ? (
                  <><Loader2 size={20} className="animate-spin" /> Vérification en cours...</>
                ) : (
                  <><Save size={20} /> Enregistrer et vérifier l'orthographe</>
                )}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* List cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {lists.map(list => (
          <motion.div
            key={list.id}
            layout
            className="card-playful space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg text-foreground">{list.name}</h3>
              <div className="flex gap-2">
                <button onClick={() => { setEditing(list); setSpellResults(null); }} className="text-muted-foreground hover:text-primary">
                  <Edit2 size={18} />
                </button>
                <button onClick={() => handleDeleteList(list.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{list.words.length} mot(s)</p>
            {list.words.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => onStartExercise(list, 1)}
                  className="btn-playful flex-1 bg-secondary text-secondary-foreground text-sm py-2"
                >
                  <BookOpen size={16} /> Niveau 1
                </button>
                <button
                  onClick={() => onStartExercise(list, 2)}
                  className="btn-playful flex-1 bg-accent text-accent-foreground text-sm py-2"
                >
                  <BookOpen size={16} /> Niveau 2
                </button>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {lists.length === 0 && !showCreate && (
        <div className="text-center py-12">
          <p className="text-5xl mb-4">📚</p>
          <p className="text-muted-foreground font-body text-lg">Pas encore de liste. Crée ta première !</p>
        </div>
      )}
    </div>
  );
}
