import { DictationList, DictationSession } from './types';

const LISTS_KEY = 'dictation-lists';
const SESSIONS_KEY = 'dictation-sessions';

export function getLists(): DictationList[] {
  const data = localStorage.getItem(LISTS_KEY);
  if (!data) return [];
  const lists: DictationList[] = JSON.parse(data);
  // Migrate old words that lack wordType/isVerb
  for (const list of lists) {
    for (const word of list.words) {
      if (!word.wordType) word.wordType = word.isVerb ? 'verbe' : 'autre';
      if (word.isVerb === undefined) word.isVerb = word.wordType === 'verbe';
    }
  }
  return lists;
}

export function saveList(list: DictationList): void {
  const lists = getLists();
  const idx = lists.findIndex(l => l.id === list.id);
  if (idx >= 0) lists[idx] = list;
  else lists.push(list);
  localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
}

export function deleteList(id: string): void {
  const lists = getLists().filter(l => l.id !== id);
  localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
}

export function getSessions(): DictationSession[] {
  const data = localStorage.getItem(SESSIONS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveSession(session: DictationSession): void {
  const sessions = getSessions();
  sessions.push(session);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}
