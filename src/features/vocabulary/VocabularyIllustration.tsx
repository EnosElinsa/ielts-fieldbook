import { useState } from 'react';
import type { VocabularyIllustrationAsset } from '../../domain/vocabulary/media';
import '../../styles/vocabulary-media.css';
/** Detail-only illustration; key by src when changing assets to reset error state. */
export function VocabularyIllustration({ image }: { image: VocabularyIllustrationAsset }) {
  return <IllustrationAsset key={image.src} image={image} />;
}
function IllustrationAsset({ image }: { image: VocabularyIllustrationAsset }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <figure className="vocabulary-illustration"><img src={image.src} alt={image.alt} width={image.width} height={image.height} loading="lazy" decoding="async" onError={() => setFailed(true)} /><figcaption>{image.caption} <a href={image.sourceUrl} target="_blank" rel="noreferrer">Image source</a> · {image.author} · <a href={image.licenseUrl} target="_blank" rel="noreferrer">{image.license}</a>{image.changes && <small>{image.changes}</small>}</figcaption></figure>;
}
