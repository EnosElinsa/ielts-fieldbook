import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Download, Pause, Play } from 'lucide-react';
import { getAudio } from '../storage/audio';
import { InlineLoadingState, StateMessage } from './AsyncState';
import '../styles/recording-player.css';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function RecordingPlayer({ src, label = 'Recording', onPlaybackChange }: {
  src: string;
  label?: string;
  onPlaybackChange?: (playing: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLAudioElement>(null);
  const wave = useRef<WaveSurfer | null>(null);
  const callback = useRef(onPlaybackChange);
  callback.current = onPlaybackChange;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!container.current || !media.current) return;
    let active = true;
    setStatus('loading');
    const fail = () => { if (active) setStatus('error'); };
    let player: WaveSurfer | undefined;
    try {
      // WaveSurfer decodes the real source and shares the mounted native player.
      // Its constructor loads this URL; an additional load would supersede it.
      player = WaveSurfer.create({ container: container.current, media: media.current, url: new URL(src, window.location.href).href, height: 76, waveColor: '#b6c2d0', progressColor: '#2563eb', cursorColor: '#17212f', barWidth: 2, barGap: 2, barRadius: 1, dragToSeek: true, normalize: true });
      wave.current = player;
      player.on('ready', (seconds) => { if (active) { setDuration(seconds); setStatus('ready'); } });
      player.on('timeupdate', (seconds) => { if (active) setPosition(seconds); });
      player.on('play', () => { if (active) { setPlaying(true); callback.current?.(true); } });
      player.on('pause', () => { if (active) { setPlaying(false); callback.current?.(false); } });
      player.on('finish', () => { if (active) { setPlaying(false); callback.current?.(false); } });
      player.on('error', fail);
    } catch { fail(); }
    return () => { active = false; wave.current = null; player?.destroy(); };
  }, [src, retry]);
  useEffect(() => { setPlaying(false); setDuration(0); setPosition(0); setSpeed(1); }, [src]);

  return <div className="audio-player recording-player">
    <div className="audio-player-head"><strong>{label}</strong><a className="btn line" href={src} download="ielts-recording.webm"><Download size={16} /> Download</a></div>
    <div className="recording-waveform-slot"><div className="waveform" ref={container} aria-label="Recording waveform" aria-busy={status==='loading'} />
      <div className="recording-waveform-status">{status === 'loading' ? <InlineLoadingState message="Loading audio waveform…" onRetry={() => setRetry(value => value + 1)} retryLabel="Retry waveform" /> : null}
      {status === 'error' ? <StateMessage kind="error" message="The waveform could not load. Play or download the recording below." onRetry={() => setRetry(value => value + 1)} retryLabel="Retry waveform" /> : null}</div>
    </div>
      <div className="wave-timeline" aria-hidden="true">{[0, 1, 2, 3, 4].map((tick) => <span key={tick}>{clock(duration * tick / 4)}</span>)}</div>
      <input className="audio-seek" aria-label="Recording playback position" type="range" disabled={status!=='ready'} min="0" max={duration || 1} step="0.1" value={position} aria-valuetext={`${clock(position)} of ${clock(duration)}`} onChange={(event) => wave.current?.setTime(Number(event.target.value))} />
      <div className="audio-controls"><button className="btn line icon-btn" disabled={status!=='ready'} aria-label={playing ? 'Pause recording' : 'Play recording'} title={playing ? 'Pause recording' : 'Play recording'} onClick={() => { const current=wave.current; void current?.playPause().catch(() => { if(wave.current===current)setStatus('error'); }); }}>{playing ? <Pause size={18} /> : <Play size={18} />}</button><span className="audio-time">{clock(position)} / {clock(duration)}</span><label className="audio-speed">Speed<select aria-label="Playback speed" value={speed} onChange={(event) => { const rate = Number(event.target.value); setSpeed(rate); if(media.current)media.current.playbackRate=rate; wave.current?.setPlaybackRate(rate, true); }}>{[0.75, 1, 1.25, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate}x</option>)}</select></label></div>
      <audio ref={media} controls src={src} preload="metadata" aria-label={`${label} native playback`} onPlay={()=>{setPlaying(true);callback.current?.(true);}} onPause={()=>{setPlaying(false);callback.current?.(false);}} onEnded={()=>{setPlaying(false);callback.current?.(false);}} onTimeUpdate={event=>setPosition(event.currentTarget.currentTime)} onLoadedMetadata={event=>{const seconds=event.currentTarget.duration;if(Number.isFinite(seconds))setDuration(seconds);}} />
  </div>;
}

export function SessionAudioPlayer({
  audioId,
  label = 'Recording',
}: {
  audioId?: string | null;
  label?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setMissing(false);
    if (!audioId) {
      setMissing(true);
      return undefined;
    }
    getAudio(audioId)
      .then((blob) => {
        if (revoked) return;
        if (!blob) {
          setMissing(true);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!revoked) setMissing(true);
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioId, retry]);

  if (!audioId) return null;
  if (missing) {
    return <StateMessage message="Recording unavailable on this account." onRetry={() => setRetry(value => value + 1)} retryLabel="Retry recording" />;
  }
  if (!url) return <InlineLoadingState message="Loading account recording…" onRetry={() => setRetry(value => value + 1)} retryLabel="Retry recording" />;

  return (
    <RecordingPlayer src={url} label={label} />
  );
}
