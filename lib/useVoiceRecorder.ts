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
  // Silence detection — peak RMS observed during the recording. Speech
  // (even quiet speech) peaks well above 0.02; an untouched mic with
  // noiseSuppression on stays under ~0.01. Guards against the accidental
  // mic tap → silent clip → hallucinated transcript failure mode.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const peakRmsRef = useRef(0);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartedAtRef = useRef(0);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; }, [onText]);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };
  const releaseStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };
  const stopMeter = () => {
    if (meterTimerRef.current) { clearInterval(meterTimerRef.current); meterTimerRef.current = null; }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  /** Stop recording. cancel=true discards the clip without transcribing. */
  const stop = useCallback((cancel = false) => {
    cancelledRef.current = cancel;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop(); // onstop handles transcription + cleanup
    } else {
      releaseStream();
      stopMeter();
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

    // Level meter: sample RMS ~10x/sec, remember the peak. Fails open —
    // if AudioContext is unavailable the peak stays at Infinity sentinel
    // and the silence check is skipped.
    peakRmsRef.current = 0;
    try {
      type WKWindow = Window & { webkitAudioContext?: typeof AudioContext };
      const AC = window.AudioContext ?? (window as WKWindow).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        src.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        meterTimerRef.current = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          if (rms > peakRmsRef.current) peakRmsRef.current = rms;
        }, 100);
      } else {
        peakRmsRef.current = Infinity;
      }
    } catch {
      peakRmsRef.current = Infinity; // metering unavailable — don't block
    }

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
      : '';
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunksRef.current = [];
    cancelledRef.current = false;

    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      releaseStream();
      const peakRms = peakRmsRef.current;
      stopMeter();
      const durationSec = recStartedAtRef.current ? (Date.now() - recStartedAtRef.current) / 1000 : 0;
      const type = rec.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      // Discard cancelled or blink-length recordings (<0.3s of opus ≈ <1 KB)
      if (cancelledRef.current || blob.size < 1000) return;
      // Silence guard: the clip never reached speech-level energy. Skip the
      // API entirely — transcription models hallucinate text from silence.
      if (peakRms < 0.015) {
        alert('No speech detected — try again.');
        return;
      }
      setTranscribing(true);
      try {
        const fd = new FormData();
        const ext = type.includes('mp4') ? 'm4a' : 'webm';
        fd.append('audio', blob, `voice.${ext}`);
        fd.append('duration', durationSec.toFixed(1));
        // Hard client timeout — a hung request used to leave the mic button
        // permanently disabled in the "transcribing" state.
        const r = await fetch('/api/transcribe', {
          method: 'POST',
          body: fd,
          signal: AbortSignal.timeout(50_000),
        });
        const d: { text?: string; error?: string } = await r.json().catch(() => ({}));
        if (r.ok) {
          const text = (d.text ?? '').trim();
          if (text) onTextRef.current(text);
          else alert('No speech detected — try again.');
        } else {
          alert(d.error ?? 'Transcription failed — try again.');
        }
      } catch (e) {
        const timedOut = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError');
        alert(timedOut
          ? 'Transcription timed out — try again.'
          : 'Transcription failed — check your connection and try again.');
      } finally {
        setTranscribing(false);
      }
    };

    rec.start();
    recorderRef.current = rec;
    recStartedAtRef.current = Date.now();
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
    stopMeter();
    clearTimer();
  }, []);

  return { recording, transcribing, seconds, toggle, stop };
}

export function formatRecSeconds(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
