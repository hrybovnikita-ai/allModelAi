import { useEffect, useRef, useState } from 'react';

/** Compact nav when page scrolls past sentinel (no per-pixel scroll state). */
export function useNavCompact() {
  const sentinelRef = useRef(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setCompact(!entry.isIntersecting),
      { root: null, threshold: 0, rootMargin: '0px 0px 0px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { sentinelRef, compact };
}
