import { useEffect, useState } from 'react';
import { ImageOff, RotateCcw } from 'lucide-react';
import { InlineLoadingState } from '../../components/AsyncState';

const retrySrc = (src: string, revision: number) => {
  if (!revision || !src || /^(?:data|blob):/i.test(src)) return src;
  return `${src}${src.includes('?') ? '&' : '?'}retry=${revision}`;
};

/** The parent keys this preview by source so a replacement starts with fresh load state. */
export function WritingChartPreview({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [revision, setRevision] = useState(0);
  const currentSrc = retrySrc(src, revision);
  useEffect(() => {
    if (status !== 'loading') return undefined;
    const timer = window.setTimeout(() => setStatus('error'), 15_000);
    return () => window.clearTimeout(timer);
  }, [status, currentSrc]);
  return <div className={`writing-chart-preview is-${status}`} aria-busy={status === 'loading'}>
    <img key={currentSrc} src={currentSrc} alt={alt} loading="lazy" decoding="async" onLoad={() => setStatus('loaded')} onError={() => setStatus('error')} />
    {status === 'loading' ? <div className="writing-chart-placeholder">
      <span className="writing-chart-skeleton" aria-hidden="true"><i /><i /><i /><i /></span>
      <InlineLoadingState message="Loading chart…" />
    </div> : status === 'error' ? <div className="writing-chart-placeholder">
      <ImageOff size={24} aria-hidden="true" />
      <span>Chart preview unavailable</span>
      <button type="button" className="btn line" aria-label={`Retry chart: ${alt}`} onClick={() => { setStatus('loading'); setRevision(value => value + 1); }}><RotateCcw size={14} />Retry chart</button>
    </div> : null}
  </div>;
}
