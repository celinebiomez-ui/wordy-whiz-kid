import { DictationWord } from './types';

/**
 * Generates natural French phrases using words from the list,
 * combining multiple words when possible.
 */

// Simple determiners for nouns
const determiners = ['le', 'la', 'un', 'une', 'mon', 'son', 'ce', 'cette'];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Filler words for building sentences when needed
const fillerNouns = ['enfant', 'chat', 'garçon', 'fille', 'oiseau'];
const fillerVerbs = ['regarde', 'aime', 'cherche', 'voit', 'trouve'];
const fillerAdj = ['joli', 'grand', 'petit'];

interface WordBucket {
  noms: DictationWord[];
  verbes: DictationWord[];
  adjectifs: DictationWord[];
  adverbes: DictationWord[];
  conjonctions: DictationWord[];
  expressions: DictationWord[];
  autres: DictationWord[];
}

function bucketize(words: DictationWord[]): WordBucket {
  const b: WordBucket = { noms: [], verbes: [], adjectifs: [], adverbes: [], conjonctions: [], expressions: [], autres: [] };
  for (const w of words) {
    switch (w.wordType) {
      case 'nom': b.noms.push(w); break;
      case 'verbe': b.verbes.push(w); break;
      case 'adjectif': b.adjectifs.push(w); break;
      case 'adverbe': b.adverbes.push(w); break;
      case 'conjonction': case 'preposition': b.conjonctions.push(w); break;
      case 'expression': b.expressions.push(w); break;
      default: b.autres.push(w); break;
    }
  }
  return b;
}

// Special words that need specific structures
const specialWordHandlers: Record<string, (usedWords: Set<string>, bucket: WordBucket) => string> = {
  'parce que': (_used, b) => {
    const subj = pickRandom(determiners) + ' ' + (b.noms.length ? pickRandom(b.noms).text.toLowerCase() : pickRandom(fillerNouns));
    const verb = b.verbes.length ? pickRandom(b.verbes).text.toLowerCase() : pickRandom(fillerVerbs);
    return `${capitalize(subj)} ${verb} parce que c'est important.`;
  },
  'quand': (_used, b) => {
    const subj = pickRandom(determiners) + ' ' + (b.noms.length ? pickRandom(b.noms).text.toLowerCase() : pickRandom(fillerNouns));
    const verb = b.verbes.length ? pickRandom(b.verbes).text.toLowerCase() : pickRandom(fillerVerbs);
    return `${capitalize(subj)} ${verb} quand il fait beau.`;
  },
  'sans': (_used, b) => {
    const subj = pickRandom(determiners) + ' ' + (b.noms.length ? pickRandom(b.noms).text.toLowerCase() : pickRandom(fillerNouns));
    const verb = b.verbes.length ? pickRandom(b.verbes).text.toLowerCase() : pickRandom(fillerVerbs);
    return `${capitalize(subj)} part sans ${verb}.`;
  },
  'ensuite': (_used, b) => {
    const subj = pickRandom(determiners) + ' ' + (b.noms.length ? pickRandom(b.noms).text.toLowerCase() : pickRandom(fillerNouns));
    const verb1 = b.verbes.length ? pickRandom(b.verbes).text.toLowerCase() : pickRandom(fillerVerbs);
    const verb2 = pickRandom(fillerVerbs);
    return `${capitalize(subj)} ${verb1}, ensuite il ${verb2}.`;
  },
  "qu'est-ce que": (_used, b) => {
    const subj = pickRandom(determiners) + ' ' + (b.noms.length ? pickRandom(b.noms).text.toLowerCase() : pickRandom(fillerNouns));
    return `Qu'est-ce que ${subj} fait ?`;
  },
};

function buildPhrase(targetWords: DictationWord[], allBucket: WordBucket): string {
  // Check if any target word is a special expression
  for (const w of targetWords) {
    const key = w.text.toLowerCase();
    if (specialWordHandlers[key]) {
      return specialWordHandlers[key](new Set(), allBucket);
    }
  }

  const noms = targetWords.filter(w => w.wordType === 'nom');
  const verbes = targetWords.filter(w => w.wordType === 'verbe');
  const adjectifs = targetWords.filter(w => w.wordType === 'adjectif');
  const adverbes = targetWords.filter(w => w.wordType === 'adverbe');
  const others = targetWords.filter(w => !['nom', 'verbe', 'adjectif', 'adverbe'].includes(w.wordType));

  // Build subject
  const det = pickRandom(determiners);
  const noun = noms.length > 0 ? noms[0].text.toLowerCase() : pickRandom(fillerNouns);
  
  // Build verb
  let verb: string;
  if (verbes.length > 0) {
    const v = verbes[0];
    if (v.expectedAnswers && v.expectedAnswers.length > 0) {
      verb = pickRandom(v.expectedAnswers);
    } else {
      verb = v.text.toLowerCase();
    }
  } else {
    verb = pickRandom(fillerVerbs);
  }

  // Build complement
  let complement = '';
  if (noms.length > 1) {
    complement = ` ${pickRandom(determiners)} ${noms[1].text.toLowerCase()}`;
  }

  // Build adverb placement
  let adverbStr = '';
  if (adverbes.length > 0) {
    adverbStr = ` ${adverbes[0].text.toLowerCase()}`;
  }

  // Build adjective
  let adjStr = '';
  if (adjectifs.length > 0) {
    if (complement) {
      adjStr = ` ${adjectifs[0].text.toLowerCase()}`;
    } else {
      // Adjective modifies the subject
      complement = '';
      adjStr = '';
      // Use template: Det + adj + noun + verb
      return `${capitalize(det)} ${adjectifs[0].text.toLowerCase()} ${noun} ${verb}${adverbStr}.`;
    }
  }

  // Handle remaining other words (conjonctions etc.)
  let suffix = '';
  if (others.length > 0) {
    for (const o of others) {
      const key = o.text.toLowerCase();
      if (specialWordHandlers[key]) {
        // Already handled above, shouldn't reach here
        continue;
      }
      // Generic: append as part of the sentence
      suffix += ` ${o.text.toLowerCase()}`;
    }
  }

  return `${capitalize(det)} ${noun} ${verb}${adverbStr}${complement}${adjStr}${suffix}.`;
}

/**
 * Generate phrases for level 2, trying to combine multiple words per phrase.
 * Returns an array of { phrase, wordIds[] } so we know which words are tested.
 */
export interface GeneratedPhrase {
  phrase: string;
  wordIds: string[];
}

export function generatePhrases(words: DictationWord[]): GeneratedPhrase[] {
  const bucket = bucketize(words);
  const remaining = [...words];
  const phrases: GeneratedPhrase[] = [];

  // Shuffle remaining
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }

  while (remaining.length > 0) {
    // Try to grab 2-3 words for one phrase
    const batch: DictationWord[] = [];
    const batchSize = Math.min(remaining.length, Math.random() < 0.5 ? 2 : 3);
    
    for (let i = 0; i < batchSize; i++) {
      batch.push(remaining.shift()!);
    }

    const phrase = buildPhrase(batch, bucket);
    phrases.push({
      phrase,
      wordIds: batch.map(w => w.id),
    });
  }

  return phrases;
}

export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
