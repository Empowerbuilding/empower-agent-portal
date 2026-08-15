'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Record-first voice input: MediaRecorder captures a clean audio clip,
 * then /api/transcribe (OpenAI gpt-4o-mini-transcribe) turns it into text.
 * Replaces the old live SpeechRecognition flow — far more accurate,
 * works on every browser (incl. iOS Safari), and supports domain vocab.
 *
 * While recording: Space stops (when not typing in a field), Escape cancels.
 */
export function useVoiceRecorder(onText: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; }, [onText]);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };
  const releaseStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  /** Stop recording. cancel=true discards the clip without transcribing. */
  const stop = useCallback((cancel = false) => {
    cancelledRef.current = cancel;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop(); // onstop handles transcription + cleanup
    } else {
      releaseStream();
    }
    clearTimer();
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined') {
      alert('Voice recording is not supported in this browser.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      alert('Microphone access denied or unavailable.');
      return;
    }
    streamRef.current = stream;

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
      : '';
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunksRef.current = [];
    cancelledRef.current = false;

    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      releaseStream();
      const type = rec.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      // Discard cancelled or blink-length recordings (<0.3s of opus ≈ <1 KB)
      if (cancelledRef.current || blob.size < 1000) return;
      setTranscribing(true);
      try {
        const fd = new FormData();
        const ext = type.includes('mp4') ? 'm4a' : 'webm';
        fd.append('audio', blob, `voice.${ext}`);
        const r = await fetch('/api/transcribe', { method: 'POST', body: fd });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.text) onTextRef.current(d.text);
        else if (!r.ok) alert(d.error ?? 'Transcription failed — try again.');
      } catch {
        alert('Transcription failed — check your connection and try again.');
      } finally {
        setTranscribing(false);
      }
    };

    rec.start();
    recorderRef.current = rec;
    setSeconds(0);
    clearTimer();
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    setRecording(true);
  }, []);

  const toggle = useCallback(() => {
    if (recording) stop();
    else start();
  }, [recording, stop, start]);

  // Keyboard: Space stops (outside text fields), Escape cancels — only while recording
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const editable = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.code === 'Space' && !editable) { e.preventDefault(); stop(); }
      else if (e.key === 'Escape') { e.preventDefault(); stop(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, stop]);

  // Cleanup on unmount — discard any in-flight recording
  useEffect(() => () => {
    cancelledRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    releaseStream();
    clearTimer();
  }, []);

  return { recording, transcribing, seconds, toggle, stop };
}

export function formatRecSeconds(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
