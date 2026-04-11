import { motion } from 'framer-motion';
import { Home, RotateCcw, Trophy } from 'lucide-react';
import { DictationSession } from '@/lib/types';

interface Props {
  session: DictationSession;
  onHome: () => void;
  onRetry: () => void;
}

export default function SessionSummary({ session, onHome, onRetry }: Props) {
  const emoji = session.percentage === 100
    ? '🏆'
    : session.percentage >= 80
      ? '🌟'
      : session.percentage >= 50
        ? '👍'
        : '💪';

  const message = session.percentage === 100
    ? 'Parfait ! Tu es un champion !'
    : session.percentage >= 80
      ? 'Excellent travail !'
      : session.percentage >= 50
        ? 'Bien joué, continue !'
        : 'Ne lâche rien, tu vas y arriver !';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-lg mx-auto card-playful text-center space-y-6"
    >
      <motion.p
        className="text-7xl"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        {emoji}
      </motion.p>

      <h2 className="text-3xl font-display text-foreground">{message}</h2>

      <div className="rounded-2xl bg-muted/50 p-6 space-y-3">
        <p className="text-muted-foreground font-body">
          {session.level === 1 ? '📘 Niveau 1' : '📗 Niveau 2'} — {session.listName}
        </p>
        <p className="text-4xl font-display text-foreground">
          {session.totalScore}<span className="text-lg text-muted-foreground">/{session.maxScore}</span>
        </p>
        <div className="h-4 rounded-full bg-muted overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${
              session.percentage >= 80 ? 'bg-success' : session.percentage >= 50 ? 'bg-warning' : 'bg-destructive'
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${session.percentage}%` }}
            transition={{ duration: 1, delay: 0.5 }}
          />
        </div>
        <p className={`text-2xl font-bold ${
          session.percentage >= 80 ? 'text-success' : session.percentage >= 50 ? 'text-warning-foreground' : 'text-destructive'
        }`}>
          {session.percentage}%
        </p>
      </div>

      {/* Detail per word */}
      <div className="space-y-2 text-left">
        {session.results.map((r, i) => (
          <div key={i} className={`flex items-center gap-3 rounded-xl px-4 py-2 ${
            r.score === 1 ? 'bg-success/10' : r.score === 0.5 ? 'bg-warning/10' : 'bg-destructive/10'
          }`}>
            <span>{r.score === 1 ? '⭐' : r.score === 0.5 ? '✅' : '❌'}</span>
            <span className="flex-1 font-body text-sm text-foreground">{r.word}</span>
            <span className="text-xs font-bold text-muted-foreground">{r.score} pt</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 justify-center">
        <button onClick={onRetry} className="btn-playful bg-secondary text-secondary-foreground">
          <RotateCcw size={18} /> Recommencer
        </button>
        <button onClick={onHome} className="btn-playful bg-primary text-primary-foreground">
          <Home size={18} /> Accueil
        </button>
      </div>
    </motion.div>
  );
}
