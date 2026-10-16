/** Decode complete chat SSE data frames, retaining incomplete network chunks. */
export function splitChatSse(buffer, done = false) {
  const frames = buffer.replaceAll('\r\n', '\n').split('\n\n');
  const tail = frames.pop() || '';
  if (done && tail.trim()) frames.push(tail);
  return {
    buffer: done ? '' : tail,
    data: frames.map(frame => frame.split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, ''))
      .join('\n'))
      .filter(data => data && data.trim() !== '[DONE]'),
  };
}
