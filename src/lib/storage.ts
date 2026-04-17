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

// ============ SESSIONS (localStorage — résultats personnels par appareil) ============

export function getSessions(): DictationSession[] {
  const data = localStorage.getItem(SESSIONS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveSession(session: DictationSession): void {
  const sessions = getSessions();
  sessions.push(session);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}
