import { contextKey, definitionFor, normalize } from './schema';
import type { Match, PageField, ProfileItem, Store } from './types';

export function matchField(field: PageField, store: Store): Match | undefined {
  if (field.kind === 'unsupported' || field.repeated || field.label === '未命名字段') return;
  const remembered = store.memories.find(m => m.signature === field.signature);
  if (remembered && store.items.some(i => i.id === remembered.itemId && i.value.trim() && !i.group)) {
    return { itemId: remembered.itemId, confidence: 'memory', reason: '已记住这个问题' };
  }
  const keys = [field.label, ...field.hints].map(normalize).filter(Boolean);
  const labelDefinition = definitionFor(field.label, field.context);
  const fieldDefinition = labelDefinition ?? field.hints.map(hint => definitionFor(hint, field.context)).find(Boolean);
  const section = contextKey(field.context);
  const candidates = store.items.filter(i => i.value.trim()).map(item => {
    if (item.source === 'memory') {
      const prefix = field.signature.slice(0, field.signature.lastIndexOf('|'));
      const explicitAlias = item.aliases.some(a => normalize(a) === normalize(field.label));
      const sameScope = store.memories.some(m => m.itemId === item.id && m.signature.slice(0, m.signature.lastIndexOf('|')) === prefix);
      return { item, score: explicitAlias && sameScope ? 100 : 0 };
    }
    let score = 0;
    if ([item.label, ...item.aliases].some(a => normalize(a) === normalize(field.label))) score = 100;
    if (fieldDefinition && definitionFor(item.label)?.label === fieldDefinition.label) score = Math.max(score, 95);
    if (!score && !field.label && [item.label, ...item.aliases].some(a => keys.includes(normalize(a)))) score = 85;
    const itemDefinition = definitionFor(item.label);
    // Do not put a whole experience paragraph into a school/company/title input.
    if (itemDefinition?.multiline && field.kind !== 'multiline') score = 0;
    if (section && item.category !== '基本信息' && contextKey(item.category) && contextKey(item.category) !== section) score = 0;
    if (item.group?.kind === 'project' && !section && !/项目|project/i.test(field.label)) score = 0;
    return { item, score };
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);
  if (!candidates.length || candidates[0].score === candidates[1]?.score) return;
  return { itemId: candidates[0].item.id, confidence: 'exact', reason: '字段名称匹配' };
}

export function compatibleValue(field: PageField, value: string): { value?: string; reason?: string } {
  if (field.kind === 'unsupported') return { reason: '这是自定义控件，请在网页中填写' };
  if (field.kind === 'select') {
    const choices = field.options?.filter(o => !o.disabled && o.value !== '') ?? [];
    const choiceKey = (s: string) => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
    const candidates = choices.filter(o => choiceKey(o.label) === choiceKey(value) || choiceKey(o.value) === choiceKey(value));
    return candidates.length === 1 ? { value: candidates[0].value } : { reason: '下拉选项中没有唯一对应项，请选择网页提供的选项' };
  }
  if (field.kind === 'date' || field.kind === 'month') {
    const parts = value.trim().match(/^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?月?$/);
    if (!parts || (field.kind === 'date' && !parts[3])) return { reason: field.kind === 'date' ? '请输入完整日期 YYYY-MM-DD' : '请输入月份 YYYY-MM' };
    const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3] ?? 1);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { reason: '日期无效，请检查年月日' };
    return { value: `${parts[1]}-${String(month).padStart(2, '0')}${field.kind === 'date' ? `-${String(day).padStart(2, '0')}` : ''}` };
  }
  return { value };
}

export function sampleItems(): ProfileItem[] {
  const values: [string, string][] = [
    ['姓名', '林知夏'], ['电子邮箱', 'zhixia.lin@example.com'], ['手机号码', '13800138000'], ['所在城市', '上海'],
    ['个人简介', '专注于用户体验与前端开发，擅长把复杂需求转化为清晰、易用的产品。希望与认真做产品的团队共同成长。'],
    ['毕业院校', '同济大学'], ['专业', '软件工程'], ['最高学历', '本科'],
    ['专业技能', 'TypeScript、React、交互设计、Figma、可访问性设计'], ['出生日期', '1998-06-12'],
  ];
  return values.map(([label, value]) => ({ id: crypto.randomUUID(), label, value, category: definitionFor(label)!.category, aliases: [], source: 'manual', updatedAt: new Date().toISOString() }));
}
