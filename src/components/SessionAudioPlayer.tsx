import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Download, Pause, Play, RotateCcw } from 'lucide-react';
import { getAudio } from '../storage/audio';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function RecordingPlayer({ src, label = 'Recording', onPlaybackChange }: {
  src: string;
  label?: string;
  onPlaybackChange?: (playing: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
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
    if (!container.current) return;
    let active = true;
    setStatus('loading');
    setPlaying(false);
    setDuration(0);
    setPosition(0);
    setSpeed(1);
    const fail = () => { if (active) { setStatus('error'); setPlaying(false); callback.current?.(false); } };
    let player: WaveSurfer | undefined;
    try {
      player = WaveSurfer.create({ container: container.current, height: 76, waveColor: '#b6c2d0', progressColor: '#2563eb', cursorColor: '#17212f', barWidth: 2, barGap: 2, barRadius: 1, dragToSeek: true, normalize: true });
      wave.current = player;
      player.on('ready', (seconds) => { if (active) { setDuration(seconds); setStatus('ready'); } });
      player.on('timeupdate', (seconds) => { if (active) setPosition(seconds); });
      player.on('play', () => { if (active) { setPlaying(true); callback.current?.(true); } });
      player.on('pause', () => { if (active) { setPlaying(false); callback.current?.(false); } });
      player.on('finish', () => { if (active) { setPlaying(false); callback.current?.(false); } });
      player.on('error', fail);
      void player.load(src).catch(fail);
    } catch { fail(); }
    return () => { active = false; wave.current = null; player?.destroy(); };
  }, [src, retry]);

  return <div className="audio-player">
    <div className="audio-player-head"><strong>{label}</strong><a className="btn line" href={src} download="ielts-recording.webm"><Download size={16} /> Download</a></div>
    <div className="waveform" ref={container} aria-label="Recording waveform" />
    {status === 'loading' ? <p className="file-hint" role="status">Loading audio waveform...</p> : null}
    {status === 'error' ? <div className="audio-error"><p role="alert">The waveform could not load. Play or download the recording below.</p><button className="btn line" onClick={() => setRetry((value) => value + 1)}><RotateCcw size={16} /> Retry waveform</button><audio controls src={src} preload="metadata" /></div> : null}
    {status === 'ready' ? <>
      <div className="wave-timeline" aria-hidden="true">{[0, 1, 2, 3, 4].map((tick) => <span key={tick}>{clock(duration * tick / 4)}</span>)}</div>
      <input className="audio-seek" aria-label="Recording playback position" type="range" min="0" max={duration} step="0.1" value={position} aria-valuetext={`${clock(position)} of ${clock(duration)}`} onChange={(event) => wave.current?.setTime(Number(event.target.value))} />
      <div className="audio-controls"><button className="btn line icon-btn" aria-label={playing ? 'Pause recording' : 'Play recording'} title={playing ? 'Pause recording' : 'Play recording'} onClick={() => { void wave.current?.playPause().catch(() => { setStatus('error'); setPlaying(false); callback.current?.(false); }); }}>{playing ? <Pause size={18} /> : <Play size={18} />}</button><span className="audio-time">{clock(position)} / {clock(duration)}</span><label className="audio-speed">Speed<select aria-label="Playback speed" value={speed} onChange={(event) => { const rate = Number(event.target.value); setSpeed(rate); wave.current?.setPlaybackRate(rate, true); }}>{[0.75, 1, 1.25, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate}x</option>)}</select></label></div>
    </> : null}
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
    return <div className="audio-error"><p role="status">Recording unavailable on this account.</p><button className="btn line" onClick={() => setRetry((value) => value + 1)}><RotateCcw size={16} /> Retry recording</button></div>;
  }
  if (!url) return <p className="file-hint" role="status">Loading account recording...</p>;

  return (
    <RecordingPlayer src={url} label={label} />
  );
}
