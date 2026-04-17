import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { DictationSession } from '@/lib/types';
import { getSessions } from '@/lib/storage';
import { supabase } from '@/integrations/supabase/client';

export default function ResultsHistory() {
  const [sessions, setSessions] = useState<DictationSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await getSessions();
      setSessions(data.reverse());
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel('dictation-sessions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dictation_sessions' }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground">📅 Date</th>
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground">📘 Niveau</th>
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground">📚 Liste</th>
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground">🧮 Score</th>
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground">📈 %</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session, i) => (
              <motion.tr
                key={session.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
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
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
