export type ChannelName = 'web' | 'signal';

export type HarborMessage = {
  channel: ChannelName;
  senderId: string;
  workspaceId: string;
  sessionId: string;
  text: string;
};

export type HarborEvent =
  | { type: 'status'; text: string }
  | { type: 'assistant_delta'; text: string }
  | { type: 'tool_event'; text: string }
  | { type: 'error'; message: string }
  | { type: 'auth'; url: string; instructions?: string }
  | { type: 'auth_device'; verificationUri: string; userCode: string; intervalSeconds?: number; expiresInSeconds?: number }
  | { type: 'auth_manual_request'; loginId: string; prompt: string }
  | { type: 'done' };

export type EventSink = (event: HarborEvent) => void;
