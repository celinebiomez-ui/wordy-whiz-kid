import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Edit2, BookOpen, X, Save } from 'lucide-react';
import { DictationList, DictationWord } from '@/lib/types';
import { getLists, saveList, deleteList } from '@/lib/storage';

interface Props {
  onStartExercise: (list: DictationList, level: 1 | 2) => void;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ListManager({ onStartExercise }: Props) {
  const [lists, setLists] = useState<DictationList[]>(getLists);
  const [editing, setEditing] = useState<DictationList | null>(null);
  const [newWordText, setNewWordText] = useState('');
  const [newWordTense, setNewWordTense] = useState('');
  const [newWordIsVerb, setNewWordIsVerb] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const refresh = () => setLists(getLists());

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    const list: DictationList = {
      id: generateId(),
      name: newListName.trim(),
      words: [],
      createdAt: new Date().toISOString(),
    };
    saveList(list);
    setNewListName('');
    setShowCreate(false);
    setEditing(list);
    refresh();
  };

  const handleDeleteList = (id: string) => {
    deleteList(id);
    refresh();
  };

  const handleAddWord = () => {
    if (!editing || !newWordText.trim()) return;
    const word: DictationWord = {
      id: generateId(),
      text: newWordText.trim(),
      tense: newWordIsVerb ? newWordTense.trim() || undefined : undefined,
      isVerb: newWordIsVerb,
    };
    const updated = { ...editing, words: [...editing.words, word] };
    saveList(updated);
    setEditing(updated);
    setNewWordText('');
    setNewWordTense('');
    setNewWordIsVerb(false);
    refresh();
  };

  const handleRemoveWord = (wordId: string) => {
    if (!editing) return;
    const updated = { ...editing, words: editing.words.filter(w => w.id !== wordId) };
    saveList(updated);
    setEditing(updated);
    refresh();
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
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            {/* Word list */}
            <div className="space-y-2">
              {editing.words.map(word => (
                <div key={word.id} className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-2">
                  <span className="flex-1 font-body text-foreground">
                    {word.text}
                    {word.isVerb && word.tense && (
                      <span className="ml-2 text-sm text-accent font-semibold">({word.tense})</span>
                    )}
                  </span>
                  <span className="text-xs rounded-lg bg-secondary/20 text-secondary px-2 py-1">
                    {word.isVerb ? '🔤 verbe' : '📝 mot'}
                  </span>
                  <button onClick={() => handleRemoveWord(word.id)} className="text-destructive hover:text-destructive/80">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {editing.words.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Aucun mot. Ajoutez-en ci-dessous !</p>
              )}
            </div>

            {/* Add word form */}
            <div className="space-y-3 rounded-xl bg-muted/30 p-4">
              <div className="flex gap-3">
                <input
                  value={newWordText}
                  onChange={e => setNewWordText(e.target.value)}
                  placeholder="Mot ou verbe..."
                  className="flex-1 rounded-xl bg-card px-4 py-3 font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  onKeyDown={e => e.key === 'Enter' && handleAddWord()}
                />
                <button onClick={handleAddWord} className="btn-playful bg-primary text-primary-foreground text-sm">
                  <Plus size={18} /> Ajouter
                </button>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newWordIsVerb}
                    onChange={e => setNewWordIsVerb(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary w-5 h-5"
                  />
                  <span className="font-body text-foreground">C'est un verbe</span>
                </label>
                {newWordIsVerb && (
                  <input
                    value={newWordTense}
                    onChange={e => setNewWordTense(e.target.value)}
                    placeholder="Temps (ex: imparfait)"
                    className="flex-1 rounded-xl bg-card px-4 py-2 text-sm font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                )}
              </div>
            </div>
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
                <button onClick={() => setEditing(list)} className="text-muted-foreground hover:text-primary">
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
