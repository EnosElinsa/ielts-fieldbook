/** Bound read-only requests so a stalled request cannot poison a shared retry cache. */
export function requestTimeout<T>(request: Promise<T>, milliseconds = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Loading took too long. Check your connection and retry.')), milliseconds);
    request.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
