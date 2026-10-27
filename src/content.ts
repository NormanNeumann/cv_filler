import { createScanner } from './scanner';
import type { FillRequest } from './types';

const scope = globalThis as typeof globalThis & { __resumePocket?: boolean };
if (!scope.__resumePocket) {
  scope.__resumePocket = true;
  const scanner = createScanner(document);
  chrome.runtime.onMessage.addListener((message: { type: string; request?: FillRequest }, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    const action = async () => {
      if (message.type === 'RP_SCAN') return scanner.scan();
      if (message.type === 'RP_FILL' && message.request) return scanner.fill(message.request);
      if (message.type === 'RP_UNDO') return scanner.undo();
      throw new Error('未知操作');
    };
    if (!['RP_SCAN', 'RP_FILL', 'RP_UNDO'].includes(message.type)) return;
    action().then(result => respond({ ok: true, result }), error => respond({ ok: false, error: String(error.message ?? error) }));
    return true;
  });
}
