import { STORE_KEY, emptyStore, validateStore } from './storage';

// Run a real action invocation so Chrome grants activeTab before opening the panel.
// Auto-toggle behavior can consume the action without granting page access.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
});
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(console.error);

// Serialize writes from multiple panels. A stale editor must reload rather than erase newer edits.
let writes = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== 'RP_STORE' || sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('panel.html'))) return;
  writes = writes.then(async () => {
    try {
      const raw = (await chrome.storage.local.get(STORE_KEY))[STORE_KEY];
      const current = raw ? validateStore(raw) : emptyStore();
      if (current.updatedAt !== message.expected) throw new Error('资料已在另一窗口更新，请重新打开侧边栏后再保存');
      const store = validateStore(message.store);
      await chrome.storage.local.set({ [STORE_KEY]: store });
      respond({ ok: true });
    } catch (error) { respond({ ok: false, error: (error as Error).message }); }
  });
  return true;
});
