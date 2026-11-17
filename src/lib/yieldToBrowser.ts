/** Let input and paint run between large account-processing stages, including after tab resume. */
export async function yieldToBrowser() {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { postTask?: (callback: () => void, options: { priority: 'background' }) => Promise<void> } }).scheduler;
  // A boosted scheduler.yield continuation can starve timers and UI updates across hundreds of batches.
  if (scheduler?.postTask) await scheduler.postTask(() => {}, { priority: 'background' });
  else await new Promise<void>(resolve => setTimeout(resolve, 0));
}

export async function yieldForLargeData(data: Record<string, unknown>) {
  if (Object.values(data).some(value => Array.isArray(value) && value.length >= 200)) await yieldToBrowser();
}
