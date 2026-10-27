"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { speakableMath, spokenToAnswer } from "@/lib/speech";
import { withoutVisuals } from "@/lib/visuals";

/** Whether this student has voice mode on. Set by the student layout. */
const VoiceContext = createContext(false);

export function VoiceProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <VoiceContext.Provider value={enabled}>{children}</VoiceContext.Provider>;
}

// The Web Speech API's recognition half is still prefixed in some browsers and missing from TS's DOM types.
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Reads text aloud, rewriting math symbols as words first. */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speakableMath(withoutVisuals(text)));
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

export function useVoice() {
  const enabled = useContext(VoiceContext);
  const [supported, setSupported] = useState({ speak: false, listen: false });
  useEffect(() => {
    setSupported({ speak: "speechSynthesis" in window, listen: !!recognitionCtor() });
  }, []);
  return { enabled, canSpeak: enabled && supported.speak, canListen: enabled && supported.listen };
}

/** Reads `text` aloud whenever it changes, if voice mode is on. */
export function useReadAloud(text: string | null | undefined) {
  const { canSpeak } = useVoice();
  useEffect(() => {
    if (canSpeak && text) speak(text);
  }, [canSpeak, text]);
}

/** A 🔊 button that reads the given text aloud. Renders nothing when voice mode is off. */
export function SpeakButton({ text, className = "" }: { text: string; className?: string }) {
  const { canSpeak } = useVoice();
  if (!canSpeak) return null;
  return (
    <button type="button" onClick={() => speak(text)} aria-label="Read aloud" title="Read aloud"
      className={`inline-grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-brand-600 ring-1 ring-slate-300 hover:bg-slate-50 ${className}`}>
      <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  );
}

/**
 * A 🎤 button that listens once and hands back what was said.
 * With `asAnswer`, spoken words like "three fourths" are turned into "3/4".
 */
export function MicButton({ onText, asAnswer = false, className = "" }: { onText: (text: string) => void; asAnswer?: boolean; className?: string }) {
  const { canListen } = useVoice();
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const stop = useCallback(() => recognition.current?.abort(), []);
  useEffect(() => stop, [stop]);
  if (!canListen) return null;

  function listen() {
    if (listening) return stop();
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    window.speechSynthesis?.cancel();
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? "";
      if (said) onText(asAnswer ? spokenToAnswer(said) : said);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  }

  return (
    <button type="button" onClick={listen} aria-label={listening ? "Stop listening" : "Say it out loud"} aria-pressed={listening}
      className={`grid shrink-0 place-items-center rounded-xl px-3 text-xl ring-1 ${listening ? "animate-pulse bg-red-50 ring-red-300" : "bg-white ring-slate-300 hover:bg-slate-50"} ${className}`}>
      🎤
    </button>
  );
}
