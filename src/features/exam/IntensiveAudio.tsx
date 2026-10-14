import { SelectField } from '../../components/SelectField';
import { InlineLoadingState, StateMessage } from '../../components/AsyncState';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
  scope?: string;
  onAvailabilityChange?: (available: boolean) => void;
  onPlaybackInvalidated?: () => void;
  onReplay: () => void;
  onSentenceEnd: () => void;
  onSpeedChange: (speed: number) => void;
  onLoopChange: (loop: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export type IntensiveAudioHandle = { replay: () => boolean; stop: () => void };
type SentencePass = { src: string; scope?: string; start: number; end: number };

export const IntensiveAudio = forwardRef<IntensiveAudioHandle, Props>(function IntensiveAudio(props, ref) {
  const container = useRef<HTMLDivElement>(null);
  const wave = useRef<WaveSurfer | null>(null);
  const current = useRef(props);
  current.current = props;
  const playingRef = useRef(false);
  const sentencePass = useRef<SentencePass | null>(null);
  const expectedSeek = useRef<number | null>(null);
  const playGeneration = useRef(0);
  const expectedPauses = useRef(0);
  const expectedLoopFinish = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [retry, setRetry] = useState(0);
  const hasBounds = props.start !== undefined && props.end !== undefined && props.start >= 0 && props.end > props.start && props.end <= duration + 0.1;
  const allowed = status === 'ready' && (props.full || hasBounds);
  const invalidate = useCallback(() => {
    sentencePass.current = null; expectedSeek.current = null; playGeneration.current += 1;
    current.current.onPlaybackInvalidated?.();
  }, []);
  const stop = useCallback(() => { invalidate(); if(playingRef.current&&wave.current)expectedPauses.current+=1; playingRef.current=false; setPlaying(false); wave.current?.pause(); }, [invalidate]);

  useEffect(() => {
    if (!container.current) return;
    let active = true;
    setStatus('loading'); setPlaying(false); setDuration(0); setPosition(0);
    playingRef.current = false; expectedPauses.current=0; expectedLoopFinish.current=false; invalidate();
    const fail = () => { if (active) { invalidate(); setStatus('error'); setPlaying(false); playingRef.current = false; } };
    let player: WaveSurfer | undefined;
    const colors = () => { const style = getComputedStyle(document.documentElement); return { waveColor: style.getPropertyValue('--muted').trim() || '#707681', progressColor: style.getPropertyValue('--blue').trim() || '#3268da', cursorColor: style.getPropertyValue('--blue').trim() || '#3268da' }; };
    const themeObserver = new MutationObserver(() => player?.setOptions(colors()));
    try {
      player = WaveSurfer.create({ container: container.current, height: 86, ...colors(), barWidth: 2, barGap: 2, barRadius: 2, dragToSeek: false, normalize: true, interact: false });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      wave.current = player;
      player.on('ready', (seconds) => { if (active) { setDuration(seconds); setStatus('ready'); player?.setPlaybackRate(current.current.speed, true); } });
      player.on('play', () => { if (active) { playingRef.current = true; setPlaying(true); } });
      player.on('pause', () => { if (active) { if(expectedPauses.current>0){expectedPauses.current-=1;return;} invalidate(); playingRef.current = false; setPlaying(false); } });
      player.on('seeking', seconds => {
        if(!active)return;
        if(expectedSeek.current!==null&&Math.abs(seconds-expectedSeek.current)<0.1){expectedSeek.current=null;return;}
        invalidate();
      });
      player.on('timeupdate', (seconds) => {
        if (!active) return;
        setPosition(seconds);
        const config = current.current;
        const pass=sentencePass.current;
        if(!pass||!playingRef.current)return;
        if(pass.src!==config.src||pass.scope!==config.scope||pass.start!==config.start||pass.end!==config.end||config.full){invalidate();return;}
        if(player?.isSeeking?.()&&(expectedSeek.current===null||Math.abs(seconds-expectedSeek.current)>=0.1)){invalidate();return;}
        if (seconds >= pass.end) {
          sentencePass.current=null; expectedSeek.current=null;
          config.onSentenceEnd();
          if (config.loop) { if(seconds>=player!.getDuration())expectedLoopFinish.current=true; replayRef.current(); }
          else player?.pause();
        }
      });
      player.on('finish', () => {
        if (!active) return;
        if(expectedLoopFinish.current){expectedLoopFinish.current=false;return;}
        invalidate(); playingRef.current = false; setPlaying(false);
      });
      player.on('error', fail);
      void player.load(props.src).catch(fail);
    } catch { fail(); }
    return () => { active = false; invalidate(); themeObserver.disconnect(); wave.current = null; player?.destroy(); };
  }, [props.src, retry, invalidate]);

  useEffect(() => { wave.current?.setPlaybackRate(props.speed, true); }, [props.speed]);
  useEffect(() => { stop(); }, [props.start, props.end, props.full, props.scope, stop]);
  useEffect(() => { props.onAvailabilityChange?.(Boolean(allowed)); }, [allowed,props.onAvailabilityChange]);

  const replay = useCallback(() => {
    if (!allowed||!wave.current) return false;
    stop();
    const generation=++playGeneration.current;
    const start=props.full ? 0 : props.start || 0;
    sentencePass.current=!props.full&&hasBounds?{src:props.src,scope:props.scope,start,end:props.end!}:null;
    expectedSeek.current=start;
    wave.current.setTime(start);
    props.onReplay();
    const player=wave.current;
    void player.play().catch(() => { if(wave.current===player&&playGeneration.current===generation){invalidate();setStatus('error');setPlaying(false);playingRef.current=false;} });
    return true;
  }, [allowed, hasBounds, props.start, props.end, props.src, props.scope, props.full, props.onReplay, stop, invalidate]);
  const replayRef=useRef(replay);replayRef.current=replay;
  useImperativeHandle(ref,()=>({replay,stop}),[replay,stop]);

  const toggle = useCallback(() => {
    if (!allowed) return;
    if (playingRef.current) stop();
    else replay();
  }, [allowed, replay, stop]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); replay(); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input,textarea,select,button,a,[role="button"],[role="slider"],[role="menu"]'))) return;
      if (event.key === ' ') { event.preventDefault(); toggle(); }
      else if (event.key === 'ArrowLeft' && !props.previousDisabled) { event.preventDefault(); stop(); props.onPrevious(); }
      else if (event.key === 'ArrowRight' && !props.nextDisabled) { event.preventDefault(); stop(); props.onNext(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle, replay, stop, props.onPrevious, props.onNext, props.previousDisabled, props.nextDisabled]);

  return <div className="audio-player intensive-player">
    <div ref={container} className="waveform" aria-label="Listening waveform" />
    {status === 'loading' ? <InlineLoadingState message="Loading audio…" onRetry={() => setRetry(value => value + 1)} retryLabel="Retry audio" /> : null}
    {status === 'error' ? <StateMessage kind="error" message="Audio could not load. Check the connection and retry." onRetry={() => setRetry(value => value + 1)} retryLabel="Retry audio" /> : null}
    {status === 'ready' && !props.full && !hasBounds ? <p role="status">Sentence timing is unavailable or outside the audio. Set valid A/B points below, or use full-track listening.</p> : null}
    <div className="intensive-audio-controls">
      <div className="intensive-transport" role="group" aria-label="Sentence playback">
      <button className="btn line intensive-skip" aria-label="Previous sentence" title="Previous sentence" disabled={props.previousDisabled} onClick={()=>{stop();props.onPrevious();}}><SkipBack size={17} /></button>
      <button className="btn primary intensive-play" aria-label={playing ? 'Pause audio' : 'Play audio'} title={playing ? 'Pause audio' : 'Play audio'} disabled={!allowed} onClick={toggle}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
      <button className="btn line" aria-label="Replay sentence" disabled={!allowed} onClick={replay}><RotateCcw size={17} /> Replay</button>
      <button className="btn line intensive-skip" aria-label="Next sentence" title="Next sentence" disabled={props.nextDisabled} onClick={()=>{stop();props.onNext();}}><SkipForward size={17} /></button>
      </div>
      <div className="intensive-playback-settings">
      <span className="audio-time">{clock(position)} / {clock(duration)}</span>
      <label>Speed <SelectField aria-label="Listening speed" value={props.speed} onChange={event => props.onSpeedChange(Number(event.target.value))}>{[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</SelectField></label>
      <button className={`btn line ${props.loop ? 'selected' : ''}`} disabled={props.full || !hasBounds} aria-pressed={props.loop} onClick={() => props.onLoopChange(!props.loop)}><Repeat size={17} /> A/B loop</button>
      </div>
    </div>
    <p className="file-hint">Space: play / pause · ← / →: sentence · Ctrl / ⌘ + Enter: replay</p>
  </div>;
});
