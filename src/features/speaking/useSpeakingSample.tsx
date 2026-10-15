import { InlineLoadingState } from '../../components/AsyncState';
import { useEffect, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';

export function useSpeakingSample(topicId?: string) {
  const fb = useFieldbook();
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!topicId || !fb.ensureSpeakingSample) return;
    let alive = true;
    setStatus('loading');
    fb.ensureSpeakingSample(topicId).then(() => { if (alive) setStatus(''); }, () => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, [topicId, fb.ensureSpeakingSample, revision]);
  return {status, retry: () => setRevision(value => value + 1)};
}

export function SpeakingSampleStatus({status, retry}: ReturnType<typeof useSpeakingSample>) {
  if (status === 'loading') return <InlineLoadingState message="Loading sample…" onRetry={retry} retryLabel="Retry sample" />;
  if (status === 'error') return <p role="alert">Sample could not be loaded. <button className="btn text" onClick={retry}>Retry</button></p>;
  return null;
}
