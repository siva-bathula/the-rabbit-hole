/** Matches server deepseek isNewsAnchoredTopic — "label — headline" trending sessions. */
export function isNewsAnchoredSessionTopic(topic) {
  return typeof topic === 'string' && /\s[—–]\s/.test(topic);
}
