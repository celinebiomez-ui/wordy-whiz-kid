import { DictationList, DictationSession } from './types';
import { supabase } from '@/integrations/supabase/client';

const SESSIONS_KEY = 'dictation-sessions';

// ============ LISTS (Supabase — partagées entre tous les ordinateurs) ============

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

// ============ SESSIONS (Supabase — résultats partagés entre ordinateurs) ============

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

  // Envoi Telegram
  await supabase.functions.invoke('send-telegram-result', {
    body: { session },
  });
}
