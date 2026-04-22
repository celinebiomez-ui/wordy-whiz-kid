import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DictationSession } from '@/lib/types';
import { getSessions } from '@/lib/storage';
import { supabase } from '@/integrations/supabase/client';

export default function ResultsHistory() {
  const [sessions, setSessions] = useState<DictationSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const data = await getSessions();
    setSessions(data.reverse());
    setLoading(false);
  };

  useEffect(() => {
    load();

    const channel = supabase
      .channel('dictation-sessions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dictation_sessions' }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleDelete = async (session: DictationSession) => {
    const pwd = prompt('🔐 Mot de passe :');
    if (pwd !== 'BRAVO') return;
    if (!confirm(`Supprimer la dictée du ${new Date(session.date).toLocaleDateString('fr-FR')} ?`)) return;

    const { error } = await supabase
      .from('dictation_sessions')
      .delete()
      .eq('id', session.id);

    if (error) {
      console.error('Erreur suppression:', error);
    } else {
      // ✅ Mise à jour immédiate du state local sans rechargement
      setSessions(prev => prev.filter(s => s.id !== session.id));
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground font-body text-lg">Chargement...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-5xl mb-4">📊</p>
        <p className="text-muted-foreground font-body text-lg">Pas encore de résultats. Lance une dictée !</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display text-foreground">📊 Mes résultats</h2>

      <div className="w-full">
        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground w-[22%]">📅 Date</th>
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground w-[20%]">📘 Niveau</th>
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground w-[20%]">📚 Liste</th>
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground w-[16%]">🧮 Score</th>
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground w-[16%]">📈 %</th>
              <th className="py-3 px-4 w-[6%]" />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {sessions.map((session, i) => (
                <motion.tr
                  key={session.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.05 }}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-3 px-4 font-body text-sm text-foreground">
                    {new Date(session.date).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center rounded-lg px-2 py-1 text-xs font-bold ${
                      session.level === 1
                        ? 'bg-secondary/20 text-secondary'
                        : 'bg-accent/20 text-accent'
                    }`}>
                      Niveau {session.level}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-body text-sm text-foreground">{session.listName}</td>
                  <td className="py-3 px-4 font-body text-sm text-foreground">
                    {session.totalScore}/{session.maxScore}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`font-bold text-sm ${
                      session.percentage >= 80
                        ? 'text-success'
                        : session.percentage >= 50
                          ? 'text-warning-foreground'
                          : 'text-destructive'
                    }`}>
                      {session.percentage}%
                      {session.percentage >= 80 && ' 🌟'}
                      {session.percentage === 100 && ' 🏆'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleDelete(session)}
                      title="Supprimer cette dictée"
                      className="text-muted-foreground hover:text-destructive transition-colors text-lg leading-none"
                    >
                      ✕
                    </button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
}
