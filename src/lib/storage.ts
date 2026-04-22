import { DictationList, DictationSession } from './types';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = 'https://xllwlwtuwvxlkconqddd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wtOSChqoLLZ_hLSfZMzK4w_hIhsTD01';

function normalizeWords(words: any[]): any[] {
  return (words || []).map(w => ({
    ...w,
    wordType: w.wordType ?? (w.isVerb ? 'verbe' : 'autre'),
    isVerb: w.isVerb ?? (w.wordType === 'verbe'),
  }));
}

export async function getLists(): Promise<DictationList[]> {
  const { data, error } = await supabase
    .from('dictation_lists')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching lists:', error);
    return [];
  }
  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    words: normalizeWords(row.words as any[]),
    createdAt: row.created_at,
  }));
}

export async function saveList(list: DictationList): Promise<void> {
  const { error } = await supabase
    .from('dictation_lists')
    .upsert({
      id: list.id,
      name: list.name,
      words: list.words as any,
      created_at: list.createdAt,
    });
  if (error) {
    console.error('Error saving list:', error);
    throw error;
  }
}

export async function deleteList(id: string): Promise<void> {
  const { error } = await supabase
    .from('dictation_lists')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('Error deleting list:', error);
    throw error;
  }
}

export async function getSessions(): Promise<DictationSession[]> {
  const { data, error } = await supabase
    .from('dictation_sessions')
    .select('*')
    .order('date', { ascending: true });
  if (error) {
    console.error('Error fetching sessions:', error);
    return [];
  }
  return (data || []).map(row => ({
    id: row.id,
    date: row.date,
    level: row.level as 1 | 2,
    listId: row.list_id,
    listName: row.list_name,
    results: row.results as any[],
    totalScore: Number(row.total_score),
    maxScore: Number(row.max_score),
    percentage: Number(row.percentage),
  }));
}

export async function saveSession(session: DictationSession): Promise<void> {
  // 1. Sauvegarde dans dictation_sessions
  const { error } = await supabase
    .from('dictation_sessions')
    .insert({
      id: session.id,
      date: session.date,
      level: session.level,
      list_id: session.listId,
      list_name: session.listName,
      results: session.results as any,
      total_score: session.totalScore,
      max_score: session.maxScore,
      percentage: session.percentage,
    });
  if (error) {
    console.error('Error saving session:', error);
    throw error;
  }

  // 2. Sauvegarde dans la table centrale `resultats`
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/save-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        type: 'dictée',
        date: session.date,
        score: session.totalScore,
        max_score: session.maxScore,
        percentage: session.percentage,
        details: session.results,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('Erreur sauvegarde resultats:', errText);
    } else {
      console.log('✅ Sauvegardé dans resultats');
    }
  } catch (e) {
    console.error('Erreur sauvegarde resultats:', e);
  }

  // 3. Notification Telegram via Edge Function
  try {
    const emoji = session.percentage >= 80 ? '🌟' : session.percentage >= 50 ? '👍' : '💪';
    const niveau = session.level === 1 ? 'Niveau 1 — Mots' : 'Niveau 2 — Phrases';

    let motsFaux = '';

    if (session.level === 1) {
      motsFaux = session.results
        .filter((r: any) => r.score < 1)
        .map((r: any) => r.score === 0 ? `❌ ${r.word}` : `⚠️ ${r.word}`)
        .join('\n');
    } else {
      motsFaux = session.results.map((r: any, i: number) => {
        const correct = r.expected === r.firstAttempt;
        return [
          `📝 Passage ${i + 1}`,
          `✏️ Attendu : ${r.expected}`,
          `💬 Saisi : ${r.firstAttempt}`,
          correct ? '✅ Correct !' : '❌ Erreur',
        ].join('\n');
      }).join('\n\n');
    }

    const message = [
      `${emoji} Nouvelle dictée terminée !`,
      `📚 Liste : ${session.listName}`,
      `📊 Niveau : ${niveau}`,
      `🎯 Score : ${session.totalScore}/${session.maxScore} (${session.percentage}%)`,
      `📅 ${new Date(session.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      `\n${motsFaux || '✅ Aucune erreur !'}`,
    ].join('\n');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Erreur Telegram:', errText);
    } else {
      console.log('✅ Notification Telegram envoyée');
    }
  } catch (e) {
    console.error('Erreur notification Telegram:', e);
  }
}
