// Thin wrappers around the Web Speech APIs (SpeechSynthesis for read-aloud,
// SpeechRecognition for voice answers) used by Commute Mode. Both are
// feature-detected — SpeechRecognition in particular is unsupported in
// Firefox, so callers must always offer a tap-to-answer fallback.

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function cancelSpeech(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}

/** Speaks `text` aloud, resolving once playback finishes (or immediately if unsupported). */
export function speak(text: string, rate = 1): Promise<void> {
  if (!isSpeechSynthesisSupported() || !text.trim()) return Promise.resolve();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

const LETTER_RE = /\b(alpha|bravo|charlie|delta|a|b|c|d)\b/i;
const PHONETIC_TO_LETTER: Record<string, string> = { alpha: "a", bravo: "b", charlie: "c", delta: "d" };

function extractLetter(transcript: string): string | null {
  const match = transcript.toLowerCase().match(LETTER_RE);
  if (!match) return null;
  const word = match[1].toLowerCase();
  return PHONETIC_TO_LETTER[word] ?? word;
}

/**
 * Listens for a single spoken answer letter (a/b/c/d, or the NATO phonetic
 * equivalent) and resolves with it — or null if nothing recognizable was
 * heard within `timeoutMs`, recognition isn't supported, or the mic was
 * denied. Never rejects, so callers don't need a try/catch around it.
 */
export function listenForLetter(timeoutMs = 8000): Promise<string | null> {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 3;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.stop(); } catch { /* already stopped */ }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = 0; i < event.results.length; i++) {
        const letter = extractLetter(event.results[i][0].transcript);
        if (letter) { finish(letter); return; }
      }
      finish(null);
    };
    recognition.onerror = () => finish(null);
    recognition.onend = () => finish(null);

    try {
      recognition.start();
    } catch {
      finish(null);
    }
  });
}
