import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export function verifyImageBytes(bytes, id) {
  try {
    const decoded = execFileSync('ffmpeg', [
      '-v', 'error', '-xerror', '-threads', '1', '-i', 'pipe:0',
      '-map', '0:v:0', '-frames:v', '1', '-f', 'framehash', '-',
    ], { input: bytes, timeout: 15_000, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    if (!/^\s*0\s*,/m.test(decoded.toString())) throw new Error('No decoded image frame');
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Install FFmpeg to verify exam images.');
    throw new Error(`Could not decode exam image ${id}.`);
  }
}

export async function readPrivateExamImage(bucket, asset, expectedSha256) {
  const { data, error } = await bucket.createSignedUrl(asset.storagePath, 60);
  if (error || !data?.signedUrl) throw new Error(`Could not sign exam image ${asset.id}.`);
  const response = await fetch(data.signedUrl, { signal: AbortSignal.timeout(20_000) })
    .catch(() => { throw new Error(`Could not fetch exam image ${asset.id}.`); });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Private storage did not return an image for ${asset.id}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (expectedSha256 && createHash('sha256').update(bytes).digest('hex') !== expectedSha256) throw new Error(`Exam image checksum differs for ${asset.id}.`);
  return bytes;
}
