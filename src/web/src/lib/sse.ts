export type SseReadResult = { lastEventId?: number; done: boolean };

export async function readEvents(res: Response, onData: (data: any, id?: number) => void, onDone?: (data: any) => void): Promise<SseReadResult> {
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) return { done: false };
  let buffer = '';
  let lastEventId: number | undefined;
  let receivedDone = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const eventName = event.split('\n').find((l) => l.startsWith('event: '))?.slice(7);
      const idLine = event.split('\n').find((l) => l.startsWith('id: '));
      const id = idLine ? Number(idLine.slice(4)) : undefined;
      if (id !== undefined && !Number.isNaN(id)) lastEventId = id;
      const line = event.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const data = JSON.parse(line.slice(6));
      if (eventName === 'done') {
        receivedDone = true;
        onDone?.(data);
      } else onData(data, id);
    }
  }
  return { lastEventId, done: receivedDone };
}
