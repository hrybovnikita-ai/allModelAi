/** True when the user is near the bottom of the messages scroller (within threshold px). */
export function isNearScrollBottom(element, thresholdPx = 120) {
  if (!element) return true;
  const { scrollTop, scrollHeight, clientHeight } = element;
  return scrollHeight - scrollTop - clientHeight <= thresholdPx;
}
