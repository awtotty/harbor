import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export function Terminal({ token, terminalId, onClose, onNewTerminal }: { token: string; terminalId?: string; onClose: () => void | Promise<void>; onNewTerminal?: () => void | Promise<void> }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!terminalId || !containerRef.current) return;
    const term = new XTerm({ cursorBlink: true, convertEol: false, fontFamily: 'Menlo, Monaco, "Cascadia Code", monospace', fontSize: 13, theme: { background: '#050a12', foreground: '#e5e7eb', cursor: '#38bdf8' } });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    term.focus();
    const resize = () => {
      fitAddon.fit();
      void fetch(`/api/terminals/${terminalId}/resize`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ cols: term.cols, rows: term.rows }) });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current);
    const replaying = { current: false };
    const dataDisposable = term.onData((input) => {
      if (replaying.current) return;
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
          const eventName = event.split('\n').find((l) => l.startsWith('event: '))?.slice(7);
          const line = event.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (!data.chunk) continue;
          if (eventName === 'replay') {
            replaying.current = true;
            term.write(data.chunk, () => { replaying.current = false; });
          } else {
            term.write(data.chunk);
          }
        }
      }
    }).catch(() => undefined);
    return () => { controller.abort(); observer.disconnect(); dataDisposable.dispose(); term.dispose(); };
  }, [terminalId, token]);

  if (!terminalId) return <section className="terminalScreen noSessionsScreen"><div className="empty"><h3>No terminal open</h3><p>Create a terminal to get shell access inside Harbor.</p>{onNewTerminal && <button onClick={onNewTerminal}>New terminal</button>}</div></section>;
  return <section className="terminalScreen"><div className="chatHeader"><div><h2>Terminal</h2></div><div className="chatActions"><button className="ghost" onClick={onClose}>Close</button></div></div><div className="terminalFrame" ref={containerRef} /></section>;
}
