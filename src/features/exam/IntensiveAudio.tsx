import { useCallback, useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Pause, Play, Repeat, RotateCcw, SkipBack, SkipForward } from 'lucide-react';

type Props = {
  src: string;
  start?: number;
  end?: number;
  speed: number;
  loop: boolean;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  full?: boolean;
  onReplay: () => void;
  onSentenceEnd: () => void;
  onSpeedChange: (speed: number) => void;
  onLoopChange: (loop: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function IntensiveAudio(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const wave = useRef<WaveSurfer | null>(null);
  const current = useRef(props);
  current.current = props;
  const playingRef = useRef(false);
  const segmentPlaying = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [retry, setRetry] = useState(0);
  const hasBounds = props.start !== undefined && props.end !== undefined && props.start >= 0 && props.end > props.start && props.end <= duration + 0.1;
  const allowed = status === 'ready' && (props.full || hasBounds);

  useEffect(() => {
    if (!container.current) return;
    let active = true;
    setStatus('loading'); setPlaying(false); setDuration(0); setPosition(0);
    playingRef.current = false; segmentPlaying.current = false;
    const fail = () => { if (active) { setStatus('error'); setPlaying(false); playingRef.current = false; } };
    let player: WaveSurfer | undefined;
    try {
      player = WaveSurfer.create({ container: container.current, height: 86, waveColor: '#b6c2d0', progressColor: '#2563eb', cursorColor: '#17212f', barWidth: 2, barGap: 2, barRadius: 1, dragToSeek: false, normalize: true, interact: false });
      wave.current = player;
      player.on('ready', (seconds) => { if (active) { setDuration(seconds); setStatus('ready'); player?.setPlaybackRate(current.current.speed, true); } });
      player.on('play', () => { if (active) { playingRef.current = true; setPlaying(true); } });
      player.on('pause', () => { if (active) { playingRef.current = false; setPlaying(false); } });
      player.on('timeupdate', (seconds) => {
        if (!active) return;
        setPosition(seconds);
        const config = current.current;
        if (segmentPlaying.current && !config.full && config.end !== undefined && seconds >= config.end - 0.03) {
          segmentPlaying.current = false;
          config.onSentenceEnd();
          if (config.loop && config.start !== undefined) {
            player?.setTime(config.start);
            segmentPlaying.current = true;
            config.onReplay();
          } else { player?.pause(); }
        }
      });
      player.on('finish', () => {
        if (!active) return;
        if (segmentPlaying.current) current.current.onSentenceEnd();
        segmentPlaying.current = false; playingRef.current = false; setPlaying(false);
      });
      player.on('error', fail);
      void player.load(props.src).catch(fail);
    } catch { fail(); }
    return () => { active = false; wave.current = null; player?.destroy(); };
  }, [props.src, retry]);

  useEffect(() => { wave.current?.setPlaybackRate(props.speed, true); }, [props.speed]);
  useEffect(() => { wave.current?.pause(); segmentPlaying.current = false; }, [props.start, props.end, props.full]);

  const replay = useCallback(() => {
    if (!allowed) return;
    segmentPlaying.current = true;
    wave.current?.setTime(props.full ? 0 : props.start || 0);
    props.onReplay();
    void wave.current?.play().catch(() => { setStatus('error'); setPlaying(false); segmentPlaying.current = false; });
  }, [allowed, props.start, props.full, props.onReplay]);

  const toggle = useCallback(() => {
    if (!allowed) return;
    if (playingRef.current) wave.current?.pause();
    else if (!segmentPlaying.current) replay();
    else void wave.current?.play().catch(() => { setStatus('error'); setPlaying(false); });
  }, [allowed, replay]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); replay(); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input,textarea,select,button,a,[role="button"],[role="slider"],[role="menu"]'))) return;
      if (event.key === ' ') { event.preventDefault(); toggle(); }
      else if (event.key === 'ArrowLeft' && !props.previousDisabled) { event.preventDefault(); props.onPrevious(); }
      else if (event.key === 'ArrowRight' && !props.nextDisabled) { event.preventDefault(); props.onNext(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle, replay, props.onPrevious, props.onNext, props.previousDisabled, props.nextDisabled]);

  return <div className="audio-player intensive-player">
    <div ref={container} className="waveform" aria-label="Listening waveform" />
    {status === 'loading' ? <p role="status">Loading audio…</p> : null}
    {status === 'error' ? <div className="audio-error"><p role="alert">Audio could not load. Check the connection and retry.</p><button className="btn line" onClick={() => setRetry(value => value + 1)}>Retry audio</button></div> : null}
    {status === 'ready' && !props.full && !hasBounds ? <p role="status">Sentence timing is unavailable or outside the audio. Set valid A/B points below, or use full-track listening.</p> : null}
    <div className="intensive-audio-controls">
      <button className="btn line" aria-label="Previous sentence" disabled={props.previousDisabled} onClick={props.onPrevious}><SkipBack size={17} /></button>
      <button className="btn" aria-label={playing ? 'Pause audio' : 'Play audio'} disabled={!allowed} onClick={toggle}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
      <button className="btn line" aria-label="Replay sentence" disabled={!allowed} onClick={replay}><RotateCcw size={17} /> Replay</button>
      <button className="btn line" aria-label="Next sentence" disabled={props.nextDisabled} onClick={props.onNext}><SkipForward size={17} /></button>
      <span className="audio-time">{clock(position)} / {clock(duration)}</span>
      <label>Speed <select aria-label="Listening speed" value={props.speed} onChange={event => props.onSpeedChange(Number(event.target.value))}>{[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
      <button className={`btn line ${props.loop ? 'selected' : ''}`} disabled={props.full || !hasBounds} aria-pressed={props.loop} onClick={() => props.onLoopChange(!props.loop)}><Repeat size={17} /> A/B loop</button>
    </div>
    <p className="file-hint">Space: play / pause · ← / →: sentence · Ctrl / ⌘ + Enter: replay</p>
  </div>;
}
