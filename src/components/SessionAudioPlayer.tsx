import { useEffect, useState } from 'react';
import { getAudio } from '../storage/audio';

export function SessionAudioPlayer({
  audioId,
  label = 'Recording',
}: {
  audioId?: string | null;
  label?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

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
  }, [audioId]);

  if (!audioId) return null;
  if (missing) {
    return <p className="file-hint">Recording not found in this browser.</p>;
  }
  if (!url) return <p className="file-hint">Loading recording…</p>;

  return (
    <div className="audio-player">
      <span className="file-hint">{label} · stays in this browser</span>
      <audio controls src={url} preload="metadata" />
    </div>
  );
}
