export async function readEvents(res: Response, onData: (data: any) => void, onDone?: (data: any) => void) {
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) return;
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const eventName = event.split('\n').find((l) => l.startsWith('event: '))?.slice(7);
      const line = event.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const data = JSON.parse(line.slice(6));
      if (eventName === 'done') onDone?.(data);
      else onData(data);
    }
  }
}
