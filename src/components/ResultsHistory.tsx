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
    if (error) console.error('Erreur suppression:', error);
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

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground">📅 Date</th>
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground">📘 Niveau</th>
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground">📚 Liste</th>
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground">🧮 Score</th>
              <th className="text-left py-3 px-4 font-display text-sm text-muted-foreground">📈 %</th>
              <th className="py-3 px-4" />
            </tr>
          </thead>
          <tbody>
            {sessions.map((session, i) => (
              <motion.tr
