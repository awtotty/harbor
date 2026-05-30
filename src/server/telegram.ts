import { readHarborConfig, writeHarborConfig, type TelegramConfig } from './app-config.js';
import { createSession, getChannelActiveSession, recordEvent, setChannelActiveSession, setSystemStatus } from './db.js';
import { MessageRouter } from './router.js';
import { sendChatMessage } from './chat-service.js';
import { handleHarborCommand } from './commands.js';

type Log = { info: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void };
let loopStarted = false;

export async function getTelegramConfig(): Promise<Omit<TelegramConfig, 'botToken'> & { configured: boolean }> {
  const config = await readHarborConfig();
  const telegram = config.telegram ?? {};
  const { botToken: _botToken, ...safeTelegram } = telegram;
  return {
    enabled: false,
    allowedUsers: [],
    recentSenders: [],
    ...safeTelegram,
    configured: Boolean(telegram.botToken),
  };
}

export async function testTelegramToken(botToken?: string): Promise<Awaited<ReturnType<typeof getTelegramConfig>>> {
  const config = await readHarborConfig();
  const token = botToken?.trim() || config.telegram?.botToken;
  if (!token) throw new Error('Missing Telegram bot token');
  const data = await telegramApi(token, 'getMe', {});
  config.telegram = {
    ...(config.telegram ?? {}),
    botToken: token,
    botInfo: { id: String(data.result.id), username: data.result.username, firstName: data.result.first_name },
  };
  await writeHarborConfig(config);
  recordEvent({ source: 'telegram', level: 'info', type: 'telegram.token_tested', title: 'Telegram bot token tested', metadata: { username: data.result.username } });
  setSystemStatus({ key: 'telegram', status: 'ok', summary: `Configured @${data.result.username ?? data.result.first_name}`, metadata: { username: data.result.username } });
  return getTelegramConfig();
}

export async function allowTelegramUser(userId: string): Promise<Awaited<ReturnType<typeof getTelegramConfig>>> {
  const config = await readHarborConfig();
  const telegram = config.telegram ?? {};
  const allowed = new Set(telegram.allowedUsers ?? []);
  allowed.add(userId.trim());
  config.telegram = { ...telegram, enabled: true, allowedUsers: [...allowed].filter(Boolean) };
  await writeHarborConfig(config);
  recordEvent({ source: 'telegram', level: 'info', type: 'telegram.user_allowed', title: 'Telegram user allowed', metadata: { userId: userId.trim() } });
  setSystemStatus({ key: 'telegram', status: 'ok', summary: 'Telegram bot enabled', metadata: { allowedUsers: config.telegram.allowedUsers?.length ?? 0 } });
  return getTelegramConfig();
}

export async function updateTelegramConfig(next: Pick<TelegramConfig, 'enabled' | 'botToken' | 'allowedUsers'>): Promise<Awaited<ReturnType<typeof getTelegramConfig>>> {
  const config = await readHarborConfig();
  const current = config.telegram ?? {};
  config.telegram = {
    ...current,
    enabled: Boolean(next.enabled),
    botToken: next.botToken?.trim() || current.botToken,
    botInfo: next.botToken?.trim() && next.botToken.trim() !== current.botToken ? undefined : current.botInfo,
    allowedUsers: next.allowedUsers?.map((user) => user.trim()).filter(Boolean) ?? [],
  };
  await writeHarborConfig(config);
  return getTelegramConfig();
}

export function startTelegramBot(router: MessageRouter, log: Log): void {
  if (loopStarted) return;
  loopStarted = true;
  void telegramLoop(router, log);
}

async function telegramLoop(router: MessageRouter, log: Log): Promise<void> {
  for (;;) {
    try {
      const config = await readHarborConfig();
      const telegram = config.telegram;
      if (telegram?.botToken) {
        setSystemStatus({ key: 'telegram', status: telegram.enabled ? 'ok' : 'disabled', summary: telegram.enabled ? 'Telegram bot polling' : 'Telegram bot configured but disabled', metadata: { lastPollAt: new Date().toISOString(), allowedUsers: telegram.allowedUsers?.length ?? 0 } });
        const updates = await telegramApi(telegram.botToken, 'getUpdates', { timeout: 25, offset: telegram.offset ?? 0 });
        for (const update of updates.result ?? []) {
          try {
            await handleUpdate(router, log, update, telegram.botToken);
          } catch (error) {
            log.error({ error, updateId: update.update_id }, 'telegram update handling failed');
            await notifyTelegramError(telegram.botToken, update, error).catch((notifyError) => log.error({ error: notifyError }, 'telegram error notification failed'));
          }
        }
        if ((updates.result ?? []).length > 0) {
          const latest = Math.max(...updates.result.map((update: any) => Number(update.update_id) + 1));
          const fresh = await readHarborConfig();
          fresh.telegram = { ...(fresh.telegram ?? {}), offset: latest };
          await writeHarborConfig(fresh);
        }
      } else {
        await sleep(3000);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordEvent({ source: 'telegram', level: 'error', type: 'telegram.poll_failed', title: 'Telegram polling failed', message });
      setSystemStatus({ key: 'telegram', status: 'error', summary: message });
      log.error({ error }, 'telegram bot polling failed');
      await sleep(5000);
    }
  }
}

async function handleUpdate(router: MessageRouter, log: Log, update: any, botToken: string): Promise<void> {
  const message = update.message ?? update.edited_message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id;
  const user = message?.from;
  if (!text || !chatId || !user?.id) return;
  await rememberSender(user);
  const userId = String(user.id);
  recordEvent({ source: 'telegram', level: 'info', type: 'telegram.message_received', title: 'Telegram message received', metadata: { userId, chatId } });
  const config = await readHarborConfig();
  if (!config.telegram?.enabled) {
    log.info({ userId }, 'recorded telegram sender; bot disabled');
    return;
  }
  const allowed = config.telegram?.allowedUsers ?? [];
  if (allowed.length === 0) {
    log.info({ userId }, 'recorded telegram sender; waiting for allowlist approval');
    return;
  }
  if (!allowed.includes(userId)) {
    log.info({ userId }, 'ignored telegram message from non-allowlisted user');
    return;
  }
  log.info({ userId, chatId }, 'received telegram message');
  const identity = String(chatId);
  let sessionId = getChannelActiveSession('telegram', identity);
  if (!sessionId) {
    const session = createSession();
    setChannelActiveSession('telegram', identity, session.id);
    sessionId = session.id;
  }
  const command = await handleHarborCommand({ text, channel: 'telegram', sessionId, identity, onProviderAuthChanged: () => router.resetSessions() });
  if (command) {
    await sendTelegramMessage(botToken, chatId, command.text);
    return;
  }
  const chunks: string[] = [];
  await sendChatMessage({
    router,
    sessionId,
    channel: 'telegram',
    senderId: userId,
    text,
    sink: (event) => {
      if (event.type === 'assistant_delta' || event.type === 'assistant_message') chunks.push(event.text);
      if (event.type === 'error') chunks.push(`\nError: ${event.message}`);
    },
  });
  await sendTelegramMessage(botToken, chatId, chunks.join('').trim() || 'Done.');
}

async function rememberSender(user: any): Promise<void> {
  const config = await readHarborConfig();
  const name = [user.first_name, user.last_name, user.username ? `@${user.username}` : undefined].filter(Boolean).join(' ');
  const id = String(user.id);
  const recent = [{ id, name, lastSeenAt: new Date().toISOString() }, ...(config.telegram?.recentSenders ?? []).filter((sender) => sender.id !== id)].slice(0, 10);
  config.telegram = { ...(config.telegram ?? {}), recentSenders: recent };
  await writeHarborConfig(config);
}

async function notifyTelegramError(botToken: string, update: any, error: unknown): Promise<void> {
  const chatId = update.message?.chat?.id ?? update.edited_message?.chat?.id;
  if (!chatId) return;
  const message = error instanceof Error ? error.message : String(error);
  await sendTelegramMessage(botToken, chatId, `Harbor error: ${message}`);
}

async function sendTelegramMessage(botToken: string, chatId: number | string, text: string): Promise<void> {
  const chunks = chunkText(text, 3900);
  for (const chunk of chunks) await telegramApi(botToken, 'sendMessage', { chat_id: chatId, text: chunk });
}

async function telegramApi(botToken: string, method: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.description ?? `Telegram ${method} failed`);
  return data;
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks.length ? chunks : ['Done.'];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
