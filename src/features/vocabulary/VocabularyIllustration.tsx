import { useState } from 'react';
import type { VocabularyIllustrationAsset } from '../../domain/vocabulary/media';
import '../../styles/vocabulary-media.css';
/** Detail-only illustration; key by src when changing assets to reset error state. */
export function VocabularyIllustration({ image, creditHref }: { image: VocabularyIllustrationAsset; creditHref?: string }) {
  return <IllustrationAsset key={image.src} image={image} creditHref={creditHref} />;
}
function IllustrationAsset({ image, creditHref }: { image: VocabularyIllustrationAsset; creditHref?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <figure className="vocabulary-illustration"><img src={image.src} alt={image.alt} width={image.width} height={image.height} loading="lazy" decoding="async" onError={() => setFailed(true)} /><figcaption>{image.caption} <a href={creditHref || image.sourceUrl} target={creditHref ? undefined : "_blank"} rel="noreferrer">{creditHref ? "Image credits" : "Image source"}</a>{!creditHref && <> · {image.author} · <a href={image.licenseUrl} target="_blank" rel="noreferrer">{image.license}</a>{image.changes && <small>{image.changes}</small>}</>}</figcaption></figure>;
}
