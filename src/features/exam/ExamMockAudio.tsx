import { useEffect, useRef, useState } from 'react';
import type { ExamAsset } from '../../domain/exam/types';
import { resolveExamAsset } from '../../storage/examCatalog';
import { examClock } from './useExamCatalog';

/** A mock has a single forward-only timeline, even when the source uses separate part tracks. */
export function ExamMockAudio({ assets, elapsedSeconds, startPosition, onPosition, completed = false }: { assets: ExamAsset[]; elapsedSeconds: number; startPosition: number; onPosition: (seconds: number) => void; completed?: boolean }) {
  const total = assets.reduce((sum, asset) => sum + (asset.duration || 0), 0);
  const joinAt = useRef(Math.min(total, Math.max(startPosition, elapsedSeconds)));
  const locate = (seconds: number) => { let remaining = seconds; for (let index = 0; index < assets.length; index++) { const duration = assets[index].duration || 0; if (remaining < duration) return { index, offset: remaining }; remaining -= duration; } return { index: assets.length, offset: 0 }; };
  const initial = useRef(locate(joinAt.current)); const [index, setIndex] = useState(initial.current.index); const offset = useRef(initial.current.offset);
  const [url, setUrl] = useState(''); const [status, setStatus] = useState<'loading' | 'playing' | 'blocked' | 'error' | 'complete'>(initial.current.index >= assets.length ? 'complete' : 'loading'); const [retry, setRetry] = useState(0); const [position, setPosition] = useState(joinAt.current);
  const audio = useRef<HTMLAudioElement>(null); const callback = useRef(onPosition); callback.current = onPosition;
  const prefix = assets.slice(0, index).reduce((sum, asset) => sum + (asset.duration || 0), 0); const current = assets[index];
  useEffect(() => {
    let alive = true; setUrl(''); if (!current || completed) { setStatus('complete'); return; }
    setStatus('loading'); void resolveExamAsset(current).then(value => { if (alive) setUrl(value); }).catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, [current?.id, retry, completed]);
  useEffect(() => { if (completed) audio.current?.pause(); }, [completed]);
  const play = async () => {
    if (!audio.current || completed || status === 'complete') return;
    const timeline = locate(Math.min(total, Math.max(position, elapsedSeconds)));
    if (timeline.index >= assets.length) { setStatus('complete'); setIndex(assets.length); setPosition(total); callback.current(total); return; }
    if (timeline.index !== index) { offset.current = timeline.offset; setIndex(timeline.index); return; }
    audio.current.currentTime = Math.max(audio.current.currentTime, timeline.offset);
    try { await audio.current.play(); setStatus('playing'); } catch { setStatus('blocked'); }
  };
  return <div className="exam-source-audio exam-mock-audio" aria-label="Mock recording"><audio ref={audio} src={url || undefined} preload="auto" controls={false} controlsList="nodownload noplaybackrate" onLoadedMetadata={() => { if (!audio.current) return; audio.current.currentTime = offset.current; offset.current = 0; audio.current.playbackRate = 1; audio.current.disableRemotePlayback = true; void play(); }} onPlay={() => setStatus('playing')} onPause={event => { if (!event.currentTarget.ended && !completed && index < assets.length) setStatus('blocked'); }} onError={() => { if (url) setStatus('error'); }} onTimeUpdate={event => { const value = Math.min(total, prefix + event.currentTarget.currentTime); setPosition(value); callback.current(value); }} onEnded={() => { const value = prefix + (current?.duration || 0); setPosition(value); callback.current(value); offset.current = 0; if (index + 1 >= assets.length) setStatus('complete'); setIndex(index + 1); }} />
    <div className="exam-mock-audio-progress"><span>{status === 'complete' || completed ? 'Recording complete · check your answers' : status === 'playing' ? `Recording ${index + 1} / ${assets.length} · continuous exam playback` : status === 'loading' ? 'Loading the exam recording…' : status === 'error' ? 'The exam recording could not load.' : 'Your browser paused the recording.'}</span><span>{examClock(position)} / {examClock(total)}</span></div><progress max={total || 1} value={position} aria-label="Recording progress" />{status === 'blocked' && !completed && <button className="btn line" onClick={() => void play()}>Continue recording</button>}{status === 'error' && !completed && <button className="btn line" onClick={() => { offset.current = audio.current?.currentTime || 0; setRetry(value => value + 1); }}>Retry audio connection</button>}
  </div>;
}
