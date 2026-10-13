type Operation = 'workspace' | 'productive' | 'vocabulary' | 'receptive' | 'save';
type Measurement = { operation: Operation; durationMs: number; failed: boolean };
const measurements: Measurement[] = [];
const resources = { requests: 0, transferredBytes: 0, longTaskMs: 0 };

/** Aggregate timing only: no URLs, account identifiers, prompts, or answers. */
export function startPerformanceTelemetry() {
  if (typeof PerformanceObserver === 'undefined') return;
  for (const type of ['resource', 'longtask']) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (type === 'resource') {
          resources.requests++;
          resources.transferredBytes += (entry as PerformanceResourceTiming).transferSize || 0;
        } else resources.longTaskMs += entry.duration;
      }
    }).observe({ type, buffered: true });
  }
}

export function timeOperation(operation: Operation) {
  const start = performance.now();
  return (failed = false) => {
    const measurement = { operation, durationMs: Math.round(performance.now() - start), failed };
    measurements.push(measurement);
    if (measurements.length > 100) measurements.shift();
    window.dispatchEvent(new CustomEvent('fieldbook:performance', { detail: measurement }));
  };
}

export function performanceSummary() {
  return { ...resources, measurements: measurements.map(row => ({...row})) };
}
