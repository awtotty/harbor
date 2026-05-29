import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import { Terminal } from './components/Terminal';
import { ActivityGroup, MessageBubble } from './components/ToolEvent';
import { promptSuggestions, themes } from './constants';
import { readEvents } from './lib/sse';
import { newId } from './lib/id';
import { formatClockTime, formatRelativeTime } from './lib/time';
import { useSessions } from './lib/useSessions';
import { useChatMessages } from './lib/useChatMessages';
import type { ChatMessage, EnvEntry, HarborEventLog, HarborSession, ModelOption, PiPackage, Provider, SelectedModel, SystemStatus, Tab, TelegramConfig, TerminalInfo, Theme } from './types';
import './styles.css';

function tabFromPath(pathname: string): Tab {
  if (pathname.startsWith('/config')) return 'config';
  if (pathname.startsWith('/system')) return 'system';
  if (pathname.startsWith('/terminal')) return 'terminal';
  return 'chat';
}

function pathForTab(tab: Tab): string {
  if (tab === 'config') return '/config';
  if (tab === 'system') return '/system';
  if (tab === 'terminal') return '/terminal';
  return '/';
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('harborToken') ?? '');
  const [password, setPassword] = useState('');
  const [tab, setTabState] = useState<Tab>(() => tabFromPath(window.location.pathname));
  const [theme, setTheme] = useState<Theme>((localStorage.getItem('harborTheme') as Theme | null) ?? 'harbor');
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>();
  const [activeSessionId, setActiveSessionId] = useState(localStorage.getItem('harborActiveSessionId') ?? '');
  const { sessions, setSessions, activeSessionUpdatedAt, loadSessions } = useSessions(token, activeSessionId, setActiveSessionId);
  useEffect(() => { if (token) { void loadTerminals(); } }, [token]);
  useEffect(() => { localStorage.setItem('harborActiveSessionId', activeSessionId); }, [activeSessionId]);
  useEffect(() => { localStorage.setItem('harborTheme', theme); }, [theme]);
  useEffect(() => {
    const onPopState = () => setTabState(tabFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function setTab(nextTab: Tab) {
    setTabState(nextTab);
    const nextPath = pathForTab(nextTab);
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
  }

  async function loadTerminals() {
    const res = await fetch('/api/terminals', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return handleAuthFailure(res);
    const data = await res.json();
    const nextTerminals = Array.isArray(data.terminals) ? data.terminals : [];
    setTerminals(nextTerminals);
    if (activeTerminalId && !nextTerminals.some((terminal: TerminalInfo) => terminal.id === activeTerminalId)) setActiveTerminalId(undefined);
  }

  async function newSession() {
    const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({}) });
    if (!res.ok) return alert(`Failed to create session (${res.status})`);
    const data = await res.json();
    if (!data.session?.id) return alert('Failed to create session: invalid server response');
    await loadSessions();
    setActiveSessionId(data.session.id);
    setTab('chat');
  }

  async function newTerminal() {
    const res = await fetch('/api/terminals', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    await loadTerminals();
    setActiveTerminalId(data.terminal.id);
    setTab('terminal');
  }

  async function closeActiveTerminal() {
    if (!activeTerminalId) return;
    await fetch(`/api/terminals/${activeTerminalId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setActiveTerminalId(undefined);
    await loadTerminals();
  }

  async function archiveActiveSession() {
    await fetch(`/api/sessions/${activeSessionId}/archive`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const res = await fetch('/api/sessions', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return handleAuthFailure(res);
    const data = await res.json();
    const nextSessions = Array.isArray(data.sessions) ? data.sessions : [];
    setSessions(nextSessions);
    setActiveSessionId(nextSessions[0]?.id ?? '');
    setTab('chat');
  }

  function handleAuthFailure(res: Response) {
    if (res.status !== 401) return;
    localStorage.removeItem('harborToken');
    setToken('');
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    if (!res.ok) return alert('Invalid password');
    const data = await res.json();
    localStorage.setItem('harborToken', data.token);
    setToken(data.token);
  }

  if (!token) return <main className={`login theme-${theme}`}><div className="brand"><span>H</span><h1>Harbor</h1></div><form onSubmit={login}><input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} /><button>Enter</button></form><p>Default password: harbor</p></main>;

  return <main className={`shell theme-${theme}`}><aside><div className="brand"><span>H</span><div><h1>Harbor</h1></div></div><div className="sessionsNav"><div className="sessionsTitle"><strong>Sessions</strong><button title="New session" onClick={newSession}>+</button></div>{sessions.map((session) => <button key={session.id} className={activeSessionId === session.id && tab === 'chat' ? 'active sessionButton' : 'sessionButton'} onClick={() => { setActiveSessionId(session.id); setTab('chat'); }}><span>{session.name}</span><small><span className="sessionTime">{formatRelativeTime(session.updatedAt)}</span><SessionTags session={session} /></small></button>)}<div className="sessionsTitle terminalsTitle"><strong>Terminals</strong><button title="New terminal" onClick={newTerminal}>+</button></div>{terminals.map((terminal) => <button key={terminal.id} className={activeTerminalId === terminal.id && tab === 'terminal' ? 'active sessionButton terminalButton' : 'sessionButton terminalButton'} onClick={() => { setActiveTerminalId(terminal.id); setTab('terminal'); }}><span>{terminal.name}</span><small>{terminal.alive ? 'open' : 'closed'}</small></button>)}</div><nav><ThemeSelector theme={theme} setTheme={setTheme} />{(['config', 'system'] as Tab[]).map((name) => <button className={tab === name ? 'active' : ''} onClick={() => setTab(name)} key={name}>{name}</button>)}</nav></aside><div className="content">{tab === 'chat' && (activeSessionId ? <Chat token={token} sessionId={activeSessionId} activeSessionUpdatedAt={activeSessionUpdatedAt} sessions={sessions} onSessionActivity={loadSessions} onArchiveSession={archiveActiveSession} canArchive={sessions.length > 0} /> : <NoSessions onNewSession={newSession} />)}{tab === 'terminal' && <Terminal token={token} terminalId={activeTerminalId} onClose={closeActiveTerminal} onNewTerminal={newTerminal} />}{tab === 'config' && <Config token={token} />}{tab === 'system' && <System token={token} />}</div></main>;
}

function NoSessions({ onNewSession }: { onNewSession: () => void | Promise<void> }) {
  return <section className="chatScreen noSessionsScreen"><div className="empty"><h3>No active sessions</h3><p>All sessions are archived. Create a new session to start chatting again.</p><button onClick={onNewSession}>New session</button></div></section>;
}

function ThemeSelector({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  return <div className="themePicker"><select aria-label="Theme" id="theme-select" value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>{themes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>;
}

function SessionTags({ session }: { session: HarborSession }) {
  const channels = [...new Set((session.linkedChannels ?? []).map((link) => link.channel).filter((channel) => channel !== 'web'))];
  if (channels.length === 0) return null;
  return <span className="sessionTags">{channels.map((channel) => <span className="sessionTag" key={channel}>{channel}</span>)}</span>;
}

function Chat({ token, sessionId, activeSessionUpdatedAt, sessions, onSessionActivity, onArchiveSession, canArchive }: { token: string; sessionId: string; activeSessionUpdatedAt?: string; sessions: HarborSession[]; onSessionActivity: () => void | Promise<unknown>; onArchiveSession: () => void | Promise<void>; canArchive: boolean }) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, busy, addMessage, appendAssistant, beginSend, finishSend } = useChatMessages({ token, sessionId, activeSessionUpdatedAt });
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    setDraft('');
    beginSend();
    addMessage({ id: newId(), role: 'user', text: message, createdAt: new Date().toISOString() });
    const startRes = await fetch('/api/chat/start', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ message, sessionId }) });
    const startData = await startRes.json();
    if (!startRes.ok || !startData.runId) {
      addMessage({ id: newId(), role: 'event', kind: 'error', text: startData.error ?? `Request failed (${startRes.status})` });
      finishSend();
      return;
    }
    const streamRes = await fetch(`/api/chat/runs/${startData.runId}/events`, { headers: { Authorization: `Bearer ${token}` } });
    if (!streamRes.ok) {
      addMessage({ id: newId(), role: 'event', kind: 'error', text: `Stream failed (${streamRes.status})` });
      finishSend();
      return;
    }
    await readEvents(streamRes, (event) => {
      if (event.type === 'assistant_delta' || event.type === 'assistant_message') appendAssistant(event.text);
      if (event.type === 'tool_event') addMessage({ id: newId(), role: 'event', kind: 'tool', text: event.text.trim(), createdAt: new Date().toISOString() });
      if (event.type === 'status') addMessage({ id: newId(), role: 'event', kind: 'status', text: event.text, createdAt: new Date().toISOString() });
      if (event.type === 'error') addMessage({ id: newId(), role: 'event', kind: 'error', text: event.message, createdAt: new Date().toISOString() });
    }, (done) => {
      if (done.sessionId && done.sessionId !== sessionId) {
        localStorage.setItem('harborActiveSessionId', done.sessionId);
        window.location.assign('/');
      }
    });
    finishSend();
    onSessionActivity();
  }

  const activeSession = sessions.find((session) => session.id === sessionId);
  return <section className="chatScreen"><div className="chatHeader"><div><h2>{activeSession?.name ?? 'Session'}</h2><p><code>/workspace</code> · <span>{sessionId}</span></p></div><div className="chatActions"><button className="ghost" onClick={onArchiveSession} disabled={busy || !canArchive}>Archive</button></div></div><div className="messageList">{messages.length === 0 && <div className="empty"><h3>Start a working session</h3><p>Ask Harbor to inspect files, run commands, review changes, or build something in this workspace.</p><div className="suggestions">{promptSuggestions.map((suggestion) => <button key={suggestion} onClick={() => setDraft(suggestion)}>{suggestion}</button>)}</div></div>}{groupChatMessages(messages).map((item) => item.type === 'activity' ? <ActivityGroup key={item.id} messages={item.messages} /> : <MessageBubble key={item.message.id} message={item.message} />)}<div ref={bottomRef} /></div><form className="composer" onSubmit={send}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Message agent…" /><div className="composerFooter"><span>Enter to send · Shift+Enter for newline</span><button disabled={busy || !draft.trim()}>{busy ? 'Working…' : 'Send ↵'}</button></div></form></section>;
}

type RenderItem = { type: 'message'; message: ChatMessage } | { type: 'activity'; id: string; messages: ChatMessage[] };

function groupChatMessages(messages: ChatMessage[]): RenderItem[] {
  const items: RenderItem[] = [];
  let toolGroup: ChatMessage[] = [];
  const flushTools = () => {
    if (toolGroup.length === 0) return;
    items.push({ type: 'activity', id: `activity-${toolGroup[0].id}-${toolGroup.length}`, messages: toolGroup });
    toolGroup = [];
  };
  for (const message of messages) {
    if (message.role === 'event' && message.kind === 'tool') {
      toolGroup.push(message);
      continue;
    }
    flushTools();
    if (message.role === 'event' && message.kind === 'status') continue;
    items.push({ type: 'message', message });
  }
  flushTools();
  return items;
}

function Config({ token }: { token: string }) { return <section className="settingsScreen"><div className="screenHeader"><h2>Config</h2><p>Manage model providers, selected model, channels, Pi packages, SSH access, and environment.</p></div><Providers token={token} /><Models token={token} /><TelegramSettings token={token} /><Packages token={token} /><SshKeys token={token} /><Env token={token} /></section>; }

function Providers({ token }: { token: string }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [log, setLog] = useState('');
  const [manualLoginId, setManualLoginId] = useState<string>();
  const [manualValue, setManualValue] = useState('');
  const load = () => fetch('/api/providers', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : { providers: [] }).then((d) => setProviders(Array.isArray(d.providers) ? d.providers : []));
  useEffect(() => { void load(); }, [token]);

  async function startLogin(id: string) {
    setLog('');
    const res = await fetch(`/api/providers/${id}/login`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    await readEvents(res, (data) => {
      if (data.type === 'status') setLog((old) => `${old}\n${data.text}`);
      if (data.type === 'auth') setLog((old) => `${old}\nOpen this URL:\n${data.url}\n${data.instructions ?? ''}`);
      if (data.type === 'auth_device') setLog((old) => `${old}\nOpen ${data.verificationUri}\nEnter code: ${data.userCode}`);
      if (data.type === 'auth_manual_request') { setManualLoginId(data.loginId); setLog((old) => `${old}\n${data.prompt}`); }
      if (data.type === 'error') setLog((old) => `${old}\nERROR: ${data.message}`);
      if (data.type === 'done') setLog((old) => `${old}\nDone.`);
    });
    await load();
  }
  async function logout(id: string) { await fetch(`/api/providers/${id}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); await load(); }
  async function submitManual() { if (!manualLoginId) return; await fetch(`/api/login-input/${manualLoginId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ value: manualValue }) }); setManualLoginId(undefined); setManualValue(''); }

  return <div className="card"><div className="cardHeader"><div><h3>Providers</h3><p>Connect subscription or API-backed model providers.</p></div></div>{providers.map((provider) => <div className="row" key={provider.id}><div><strong>{provider.name}</strong><small>{provider.id}</small></div><div><span className={provider.auth.configured ? 'statusBadge good' : 'statusBadge'}>{provider.auth.configured ? 'Connected' : 'Not connected'}</span><button onClick={() => startLogin(provider.id)}>Login</button><button className="danger" onClick={() => logout(provider.id)}>Logout</button></div></div>)}{manualLoginId && <div className="manual"><textarea value={manualValue} onChange={(e) => setManualValue(e.target.value)} placeholder="Paste full localhost redirect URL or authorization code..." /><button onClick={submitManual}>Submit authorization code</button></div>}{log && <pre>{log}</pre>}</div>;
}

function Models({ token }: { token: string }) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selected, setSelected] = useState<SelectedModel>();
  const selectedValue = selected ? `${selected.provider}/${selected.id}` : '';
  const load = () => fetch('/api/models', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : { models: [] }).then((d) => { setModels(Array.isArray(d.models) ? d.models : []); setSelected(d.selectedModel); });
  useEffect(() => { void load(); }, [token]);
  async function save(value: string) { const index = value.indexOf('/'); if (index === -1) return; const provider = value.slice(0, index); const id = value.slice(index + 1); await fetch('/api/models/select', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ provider, id }) }); await load(); }
  return <div className="card"><div className="cardHeader"><div><h3>Model</h3><p>Choose the default model for new Pi session activity.</p></div><span className="statusBadge good">{models.length} available</span></div><select value={selectedValue} onChange={(e) => save(e.target.value)}><option value="">Auto-select first available model</option>{models.map((model) => <option key={`${model.provider}/${model.id}`} value={`${model.provider}/${model.id}`}>{model.displayName}</option>)}</select><small>Log in to a provider if this list is empty.</small></div>;
}

function TelegramSettings({ token }: { token: string }) {
  const [telegram, setTelegram] = useState<TelegramConfig>({ allowedUsers: [] });
  const [botToken, setBotToken] = useState('');
  const [allowedUsers, setAllowedUsers] = useState('');
  const [error, setError] = useState('');
  const load = () => fetch('/api/telegram', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : {}).then((d: TelegramConfig) => { setTelegram(d); setAllowedUsers((d.allowedUsers ?? []).join('\n')); });
  useEffect(() => { void load(); }, [token]);
  async function save() {
    setError('');
    const res = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ enabled: telegram.enabled, botToken, allowedUsers }) });
    const data = await res.json();
    setTelegram(data);
    setBotToken('');
    setAllowedUsers((data.allowedUsers ?? []).join('\n'));
  }
  async function testToken() {
    setError('');
    const res = await fetch('/api/telegram/test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ botToken }) });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Telegram token test failed');
    setTelegram(data);
    setBotToken('');
  }
  async function useSender(senderId: string) {
    setError('');
    const res = await fetch('/api/telegram/allow-user', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId: senderId }) });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Failed to allow sender');
    setTelegram(data);
    setAllowedUsers((data.allowedUsers ?? []).join('\n'));
  }
  const botUrl = telegram.botInfo?.username ? `https://t.me/${telegram.botInfo.username}` : 'https://t.me/BotFather';
  return <div className="card"><div className="cardHeader"><div><h3>Telegram</h3><p>Fast setup: create a bot, message it once, then approve yourself.</p></div><span className={telegram.enabled ? 'statusBadge good' : 'statusBadge'}>{telegram.enabled ? 'Enabled' : telegram.configured ? 'Configured' : 'Not configured'}</span></div><div className="setupSteps"><div><span className={telegram.configured ? 'step done' : 'step'}>1</span><strong>Create bot</strong><p>Open @BotFather, send <code>/newbot</code>, then paste the token below.</p><a href="https://t.me/BotFather" target="_blank">Open BotFather</a></div><div><span className={telegram.botInfo ? 'step done' : 'step'}>2</span><strong>Test token</strong><input value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder={telegram.configured ? 'Token configured — paste a new one to replace' : 'Bot token from @BotFather'} /><div className="buttonRow"><button onClick={testToken}>Save & test token</button></div>{telegram.botInfo && <small>Connected to @{telegram.botInfo.username ?? telegram.botInfo.firstName}</small>}</div><div><span className={(telegram.recentSenders ?? []).length ? 'step done' : 'step'}>3</span><strong>Message bot</strong><p>Send any message to your bot, then refresh senders.</p><a href={botUrl} target="_blank">Open {telegram.botInfo?.username ? `@${telegram.botInfo.username}` : 'bot'}</a><div className="buttonRow"><button className="ghost" onClick={load}>Refresh recent senders</button></div></div><div><span className={(telegram.allowedUsers ?? []).length ? 'step done' : 'step'}>4</span><strong>Approve yourself</strong><div className="recentSenders">{(telegram.recentSenders ?? []).length === 0 && <small>No recent senders yet.</small>}{(telegram.recentSenders ?? []).map((sender) => <button className="copyLine" key={sender.id} onClick={() => useSender(sender.id)}><code>{sender.id}</code><span>{sender.name}</span><small>{(telegram.allowedUsers ?? []).includes(sender.id) ? 'Allowed' : 'Use me'}</small></button>)}</div></div></div><details><summary>Advanced</summary><label className="checkRow"><input type="checkbox" checked={Boolean(telegram.enabled)} onChange={(e) => setTelegram({ ...telegram, enabled: e.target.checked })} /> Enable Telegram bot</label><textarea className="keyBox" value={allowedUsers} onChange={(e) => setAllowedUsers(e.target.value)} placeholder="Allowed Telegram user IDs, one per line." /><div className="buttonRow"><button onClick={save}>Save advanced settings</button></div></details>{error && <pre className="errorBlock">{error}</pre>}</div>;
}

function Packages({ token }: { token: string }) {
  const [packages, setPackages] = useState<PiPackage[]>([]);
  const [source, setSource] = useState('');
  const [log, setLog] = useState('');
  const load = () => fetch('/api/packages', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : { packages: [] }).then((d) => setPackages(Array.isArray(d.packages) ? d.packages : []));
  useEffect(() => { void load(); }, [token]);
  async function run(path: string, body: Record<string, string> = {}) {
    setLog('');
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    await readEvents(res, (data) => {
      if (data.type === 'status') setLog((old) => `${old}\n${data.text}`);
      if (data.type === 'tool_event') setLog((old) => `${old}${data.text}`);
      if (data.type === 'error') setLog((old) => `${old}\nERROR: ${data.message}`);
      if (data.type === 'done') setLog((old) => `${old}\nDone.`);
    });
    await load();
  }
  async function install() { if (!source.trim()) return; await run('/api/packages/install', { source: source.trim() }); setSource(''); }
  return <div className="card"><div className="cardHeader"><div><h3>Packages</h3><p>Install, remove, and update Pi packages loaded by Harbor.</p></div><button onClick={() => run('/api/packages/update')}>Update all</button></div><div className="packageInstall"><input value={source} onChange={(e) => setSource(e.target.value)} placeholder="npm:pi-web-access, git URL, or local path" /><button onClick={install}>Install</button></div>{packages.map((pkg) => <div className="row" key={pkg.source}><div><strong>{pkg.source}</strong><small>{pkg.path}</small></div><div><button onClick={() => run('/api/packages/update', { source: pkg.source })}>Update</button><button className="danger" onClick={() => run('/api/packages/remove', { source: pkg.source })}>Remove</button></div></div>)}{log && <pre>{log}</pre>}</div>;
}

function SshKeys({ token }: { token: string }) {
  const [authorizedKeys, setAuthorizedKeys] = useState('');
  const [command, setCommand] = useState('');
  useEffect(() => { void fetch('/api/ssh', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : Promise.resolve({ authorizedKeys: '', command: '' })).then((d: { authorizedKeys?: string; command?: string }) => { setAuthorizedKeys(d.authorizedKeys ?? ''); setCommand(d.command ?? ''); }); }, [token]);
  async function save() {
    await fetch('/api/ssh/authorized-keys', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ authorizedKeys }) });
    alert('Saved SSH keys');
  }
  return <div className="card"><div className="cardHeader"><div><h3>SSH</h3><p>Add public keys for shell access to the Harbor container.</p></div></div><div className="copyLine"><code>{command}</code></div><textarea className="keyBox" value={authorizedKeys} onChange={(e) => setAuthorizedKeys(e.target.value)} placeholder="ssh-ed25519 AAAA... you@example" /><div className="buttonRow"><button onClick={save}>Save keys</button></div></div>;
}

function Env({ token }: { token: string }) {
  const [entries, setEntries] = useState<EnvEntry[]>([]);
  useEffect(() => { void fetch('/api/env', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : { entries: [] }).then((d) => setEntries(Array.isArray(d.entries) ? d.entries : [])); }, [token]);
  async function save() { await fetch('/api/env', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ entries }) }); alert('Saved'); }
  return <div className="card"><div className="cardHeader"><div><h3>Environment</h3><p>Advanced environment variables and secrets stored in /config/harbor.env.</p></div></div>{entries.map((entry, i) => <div className="env" key={i}><input placeholder="KEY" value={entry.key} onChange={(e) => setEntries(entries.map((x, n) => n === i ? { ...x, key: e.target.value } : x))} /><input placeholder="value" value={entry.value} onChange={(e) => setEntries(entries.map((x, n) => n === i ? { ...x, value: e.target.value } : x))} /></div>)}<div className="buttonRow"><button onClick={() => setEntries([...entries, { key: '', value: '' }])}>Add variable</button><button onClick={save}>Save</button></div></div>;
}

function System({ token }: { token: string }) {
  const [status, setStatus] = useState<unknown>();
  const [systems, setSystems] = useState<SystemStatus[]>([]);
  const [events, setEvents] = useState<HarborEventLog[]>([]);
  async function load() {
    const headers = { Authorization: `Bearer ${token}` };
    const [statusRes, systemsRes, eventsRes] = await Promise.all([
      fetch('/api/status', { headers }),
      fetch('/api/observability/status', { headers }),
      fetch('/api/observability/events?limit=80', { headers }),
    ]);
    if (statusRes.ok) setStatus(await statusRes.json());
    if (systemsRes.ok) setSystems((await systemsRes.json()).systems ?? []);
    if (eventsRes.ok) setEvents((await eventsRes.json()).events ?? []);
  }
  useEffect(() => { void load(); }, [token]);
  return <section className="settingsScreen"><div className="screenHeader"><h2>System</h2><p>Container paths, runtime status, recent events, and operational details.</p><button onClick={load}>Refresh</button></div><div className="statusGrid">{systems.map((system) => <div className={`statusCard ${system.status}`} key={system.key}><strong>{system.key}</strong><span>{system.status}</span><p>{system.summary}</p><small>{formatRelativeTime(system.updatedAt)}</small></div>)}</div><div className="card"><div className="cardHeader"><div><h3>Recent events</h3><p>Structured Harbor events visible to the web UI and agent.</p></div></div><div className="eventTable">{events.map((event) => <div className={`eventRow ${event.level}`} key={event.id}><span>{formatRelativeTime(event.createdAt)}</span><code>{event.source}</code><strong>{event.title}</strong><small>{event.message ?? event.type}</small></div>)}</div></div><div className="card"><pre>{JSON.stringify(status, null, 2)}</pre></div></section>;
}

createRoot(document.getElementById('root')!).render(<App />);
