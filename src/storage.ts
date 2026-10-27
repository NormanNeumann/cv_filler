import { categories, type FieldDraft, type ProfileItem, type Store } from './types';

export const STORE_KEY = 'resume-pocket-v1';
export const emptyStore = (): Store => ({ version: 1, items: [], memories: [], updatedAt: '' });
export const inExtension = (): boolean => Boolean(globalThis.chrome?.runtime?.id);

export function validateStore(data: unknown): Store {
  if (!data || typeof data !== 'object') throw new Error('备份格式无效');
  const s = data as Store;
  if (s.version !== 1 || !Array.isArray(s.items) || !Array.isArray(s.memories) || typeof s.updatedAt !== 'string' || s.items.length > 1000 || s.memories.length > 5000) throw new Error('不支持此备份版本，或记录数量超出限制');
  const ids = new Set<string>();
  const groups = new Map<string, string>();
  for (const item of s.items) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || ids.has(item.id) || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 160 || typeof item.value !== 'string' || item.value.length > 100000 || !categories.includes(item.category) || !['manual', 'pdf', 'memory'].includes(item.source) || typeof item.updatedAt !== 'string' || !Array.isArray(item.aliases) || item.aliases.length > 100 || !item.aliases.every(a => typeof a === 'string' && a.length <= 160)) throw new Error('资料记录格式无效');
    ids.add(item.id);
    if (item.group !== undefined) {
      const g = item.group;
      if (!g || typeof g.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(g.id) || !['education', 'project'].includes(g.kind) || typeof g.name !== 'string' || !g.name.trim() || g.name.length > 160 || !Number.isInteger(g.index) || g.index < 1 || g.index > 1000 || item.category !== (g.kind === 'project' ? '项目经历' : '教育经历')) throw new Error('经历分组格式无效');
      const description = JSON.stringify([g.kind, g.name, g.index]);
      if (groups.has(g.id) && groups.get(g.id) !== description) throw new Error('同一经历分组的信息不一致');
      groups.set(g.id, description);
    }
  }
  const signatures = new Set<string>();
  for (const m of s.memories) {
    if (!m || typeof m.signature !== 'string' || m.signature.length > 800 || typeof m.itemId !== 'string' || !ids.has(m.itemId) || signatures.has(m.signature)) throw new Error('问答记忆格式无效');
    signatures.add(m.signature);
  }
  // Whitelist data properties, including imports from untrusted JSON.
  return {
    version: 1, updatedAt: s.updatedAt,
    items: s.items.map(i => ({ id: i.id, label: i.label, value: i.value, category: i.category, aliases: [...i.aliases], source: i.source, updatedAt: i.updatedAt, ...(i.group ? { group: { id: i.group.id, kind: i.group.kind, name: i.group.name, index: i.group.index } } : {}) })),
    memories: s.memories.map(m => ({ signature: m.signature, itemId: m.itemId })),
  };
}

export async function loadStore(): Promise<Store> {
  const data = inExtension() ? (await chrome.storage.local.get(STORE_KEY))[STORE_KEY] : JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
  return data ? validateStore(data) : emptyStore();
}

export async function saveStore(store: Store): Promise<Store> {
  const previous = Date.parse(store.updatedAt) || 0;
  const next = validateStore({ ...store, updatedAt: new Date(Math.max(Date.now(), previous + 1)).toISOString() });
  if (inExtension()) {
    const response = await chrome.runtime.sendMessage({ type: 'RP_STORE', store: next, expected: store.updatedAt });
    if (!response.ok) throw new Error(response.error);
  } else localStorage.setItem(STORE_KEY, JSON.stringify(next));
  return next;
}

export function rememberAnswers(store: Store, drafts: FieldDraft[]): Store {
  const next = structuredClone(store);
  for (const draft of drafts) {
    if (!draft.remember || !draft.value.trim() || draft.field.repeated || draft.field.label === '未命名字段') continue;
    // A choice from a specific project/school must not become a global answer for all entries.
    if (next.items.some(i => i.id === draft.itemId && i.group)) continue;
    const existing = next.items.find(i => i.id === draft.itemId && i.value === draft.value);
    const oldMemory = next.memories.find(m => m.signature === draft.field.signature);
    const oldItem = next.items.find(i => i.id === oldMemory?.itemId && i.source === 'memory');
    const item: ProfileItem = existing ?? {
      id: oldItem?.id ?? crypto.randomUUID(), label: draft.field.label,
      value: draft.value.trim(), category: '问答记忆', aliases: [], source: 'memory', updatedAt: new Date().toISOString(),
    };
    const index = next.items.findIndex(i => i.id === item.id);
    if (index < 0) next.items.push(item); else next.items[index] = item;
    next.memories = next.memories.filter(m => m.signature !== draft.field.signature);
    next.memories.push({ signature: draft.field.signature, itemId: item.id });
  }
  return next;
}
