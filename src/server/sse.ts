import type { FastifyReply } from 'fastify';

export type SseStream = {
  emit: (event: string, data: unknown) => void;
  close: () => void;
};

export function openSse(reply: FastifyReply): SseStream {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Content-Encoding': 'none',
  });
  reply.raw.write(': connected\n\n');
  const keepalive = setInterval(() => {
    if (!reply.raw.destroyed) reply.raw.write(`: keepalive ${Date.now()}\n\n`);
  }, 15_000);
  keepalive.unref?.();
  return {
    emit: (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    close: () => {
      clearInterval(keepalive);
      if (!reply.raw.destroyed) reply.raw.end();
    },
  };
}
