import { definitionFor } from './schema';
import type { ItemGroup, ProfileItem } from './types';

export function groupTitle(group?: ItemGroup): string {
  return group ? `${group.kind === 'project' ? '项目' : '教育'} ${group.index} · ${group.name}` : '';
}
export function itemCaption(item: ProfileItem): string {
  return [item.category, groupTitle(item.group), item.label].filter(Boolean).join(' / ');
}
const groupKey = (group?: ItemGroup) => group ? JSON.stringify([group.kind, group.index, group.name]) : '';

export function refreshGroupNames(items: ProfileItem[]): ProfileItem[] {
  const names = new Map<string, string>();
  for (const item of items) {
    const field = definitionFor(item.label, item.category)?.label;
    if (item.group && ((item.group.kind === 'project' && field === '项目名称') || (item.group.kind === 'education' && field === '毕业院校')) && item.value.trim()) names.set(item.group.id, item.value.trim().slice(0, 160));
  }
  return items.map(item => {
    if (!item.group) return item;
    if (item.category !== (item.group.kind === 'project' ? '项目经历' : '教育经历')) {
      const { group, ...rest } = item;
      return rest;
    }
    return { ...item, group: { ...item.group, name: names.get(item.group.id) ?? item.group.name } };
  });
}

export function mergeImportedItems(existing: ProfileItem[], imported: ProfileItem[]): { items: ProfileItem[]; added: number } {
  const items = [...existing];
  const knownGroups = new Map(existing.filter(i => i.group).map(i => [groupKey(i.group), i.group!.id]));
  let added = 0;
  for (const item of refreshGroupNames(imported)) {
    const key = groupKey(item.group);
    if (items.some(i => i.label === item.label && i.value === item.value && i.category === item.category && groupKey(i.group) === key)) continue;
    const group = item.group ? { ...item.group, id: knownGroups.get(key) ?? item.group.id } : undefined;
    if (group) knownGroups.set(key, group.id);
    items.push({ ...item, ...(group ? { group } : {}) });
    added++;
  }
  return { items, added };
}
