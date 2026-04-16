import { useCallback, useRef, useEffect } from 'react';

export function useSpeech() {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    const synth = window.speechSynthesis;

    const loadVoices = () => {
      const voices = synth.getVoices();
      // Prefer a French voice with "fr-FR", fallback to any "fr"
      const frFR = voices.find(v => v.lang === 'fr-FR');
      const frAny = voices.find(v => v.lang.startsWith('fr'));
      voiceRef.current = frFR || frAny || null;
      if (voices.length > 0) readyRef.current = true;
    };

    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);

    // Chrome bug workaround: keep synth alive with periodic resume
    const keepAlive = setInterval(() => {
      if (synth.speaking) synth.resume();
    }, 5000);

    return () => {
      synth.removeEventListener('voiceschanged', loadVoices);
      clearInterval(keepAlive);
    };
  }, []);

  const speak = useCallback((text: string, rate = 0.85) => {
    const synth = window.speechSynthesis;

    // Cancel any ongoing speech
    synth.cancel();

    // Chrome bug: after cancel(), speech can stall. 
    // A small pause + resume trick fixes it.
    const doSpeak = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      utterance.rate = rate;
      utterance.pitch = 1.1;

      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
      }

      synth.speak(utterance);

      // Extra safety: force resume after a tiny delay (Chrome pause bug)
      setTimeout(() => {
        if (synth.speaking && synth.paused) {
          synth.resume();
        }
      }, 100);
    };

    // If voices aren't loaded yet, wait briefly
    if (!readyRef.current) {
      const voices = synth.getVoices();
      if (voices.length === 0) {
        // Wait for voices then speak
        const onReady = () => {
          const v = synth.getVoices();
          voiceRef.current = v.find(x => x.lang === 'fr-FR') || v.find(x => x.lang.startsWith('fr')) || null;
          readyRef.current = true;
          synth.removeEventListener('voiceschanged', onReady);
          doSpeak();
        };
        synth.addEventListener('voiceschanged', onReady);
        return;
      }
    }

    doSpeak();
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  return { speak, stop };
}
