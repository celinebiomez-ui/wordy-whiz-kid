import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ListChecks, BarChart3, Sparkles } from 'lucide-react';
import { AppView, DictationList, DictationSession } from '@/lib/types';
import ListManager from '@/components/ListManager';
import DictationExercise from '@/components/DictationExercise';
import ResultsHistory from '@/components/ResultsHistory';
import SessionSummary from '@/components/SessionSummary';

export default function Index() {
  const [view, setView] = useState<AppView>('home');
  const [activeList, setActiveList] = useState<DictationList | null>(null);
  const [activeLevel, setActiveLevel] = useState<1 | 2>(1);
  const [lastSession, setLastSession] = useState<DictationSession | null>(null);

  const handleStartExercise = (list: DictationList, level: 1 | 2) => {
    setActiveList(list);
    setActiveLevel(level);
    setView('exercise');
  };

  const handleFinish = (session: DictationSession) => {
    setLastSession(session);
    setView('home');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container max-w-4xl flex items-center justify-between py-3">
          <button onClick={() => { setView('home'); setLastSession(null); }} className="flex items-center gap-2">
            <Sparkles className="text-primary" size={24} />
            <span className="font-display text-xl text-foreground">Ma Dictée</span>
          </button>
          <div className="flex gap-1">
            {[
              { id: 'lists' as AppView, icon: ListChecks, label: 'Listes' },
              { id: 'results' as AppView, icon: BarChart3, label: 'Résultats' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => { setView(item.id); setLastSession(null); }}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-body font-semibold transition-colors ${
                  view === item.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="container max-w-4xl py-8 px-4">
        <AnimatePresence mode="wait">
          {view === 'home' && !lastSession && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-8 py-12"
            >
              <motion.p
                className="text-7xl"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                ✏️
              </motion.p>
              <h1 className="text-4xl md:text-5xl font-display text-gradient leading-tight">
                Ma Dictée Interactive
              </h1>
              <p className="text-lg text-muted-foreground font-body max-w-md mx-auto">
                Entraîne-toi à l'orthographe et à la conjugaison de façon amusante !
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => setView('lists')}
                  className="btn-playful bg-primary text-primary-foreground text-lg px-8 py-4"
                >
                  <BookOpen size={22} /> Commencer
                </button>
                <button
                  onClick={() => setView('results')}
                  className="btn-playful bg-muted text-muted-foreground text-lg px-8 py-4"
                >
                  <BarChart3 size={22} /> Mes résultats
                </button>
              </div>
            </motion.div>
          )}

          {view === 'home' && lastSession && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <SessionSummary
                session={lastSession}
                onHome={() => setLastSession(null)}
                onRetry={() => {
                  setLastSession(null);
                  if (activeList) {
                    setView('exercise');
                  }
                }}
              />
            </motion.div>
          )}

          {view === 'lists' && (
            <motion.div
              key="lists"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ListManager onStartExercise={handleStartExercise} />
            </motion.div>
          )}

          {view === 'exercise' && activeList && (
            <motion.div
              key="exercise"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <DictationExercise
                list={activeList}
                level={activeLevel}
                onFinish={handleFinish}
                onBack={() => setView('lists')}
              />
            </motion.div>
          )}

          {view === 'results' && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ResultsHistory />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
