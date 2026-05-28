import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';

export function Terminal({ token, terminalId, onClose }: { token: string; terminalId?: string; onClose: () => void | Promise<void> }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!terminalId || !containerRef.current) return;
    const term = new XTerm({ cursorBlink: true, convertEol: false, fontFamily: 'Menlo, Monaco, "Cascadia Code", monospace', fontSize: 13, theme: { background: '#050a12', foreground: '#e5e7eb', cursor: '#38bdf8' } });
    term.open(containerRef.current);
    term.focus();
    void fetch(`/api/terminals/${terminalId}/resize`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ cols: term.cols, rows: term.rows }) });
    const dataDisposable = term.onData((input) => {
      void fetch(`/api/terminals/${terminalId}/input`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ input }) });
    });
    const controller = new AbortController();
    fetch(`/api/terminals/${terminalId}/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }).then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const event of events) {
          const line = event.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (data.chunk) term.write(data.chunk);
        }
      }
    }).catch(() => undefined);
    return () => { controller.abort(); dataDisposable.dispose(); term.dispose(); };
  }, [terminalId, token]);

  if (!terminalId) return <section className="terminalScreen"><div className="empty"><h3>No terminal open</h3><p>Create a terminal from the left sidebar.</p></div></section>;
  return <section className="terminalScreen"><div className="chatHeader"><div><h2>Terminal</h2><p><code>{terminalId}</code> · <code>/workspace</code></p></div><div className="chatActions"><button className="ghost" onClick={onClose}>Close</button></div></div><div className="terminalFrame" ref={containerRef} /></section>;
}
