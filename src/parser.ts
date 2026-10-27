import { definitionFor, definitions, normalize } from './schema';
import type { Category, ProfileItem } from './types';

const headings: { category: Category; label: string; names: string[] }[] = [
  { category: '个人简介', label: '个人简介', names: ['个人简介', '自我评价', '个人总结', '自我介绍', 'summary', 'professional summary', 'profile', 'about me'] },
  { category: '教育经历', label: '教育经历', names: ['教育经历', '教育背景', '学习经历', 'education', 'academic background'] },
  { category: '工作经历', label: '工作经历', names: ['工作经历', '工作经验', '实习经历', '职业经历', 'work experience', 'professional experience', 'employment history', 'experience'] },
  { category: '项目经历', label: '项目经历', names: ['项目经历', '项目经验', 'projects', 'project experience', 'selected projects'] },
  { category: '技能证书', label: '专业技能', names: ['专业技能', '技术技能', '技能', '技能清单', 'skills', 'technical skills'] },
  { category: '技能证书', label: '证书奖项', names: ['证书奖项', '荣誉奖项', '获奖经历', '资格证书', 'certifications', 'certificates', 'awards', 'honors'] },
];

export function parseResume(text: string): ProfileItem[] {
  const lines = text.split(/\r?\n/).map(l => l.replace(/[\t ]+/g, ' ').trim()).filter(Boolean);
  const items: ProfileItem[] = [];
  const add = (label: string, value: string, category?: Category) => {
    value = value.trim();
    if (!value || items.some(i => i.label === label && i.value === value)) return;
    const definition = definitionFor(label);
    items.push({ id: crypto.randomUUID(), label, value, category: category ?? definition?.category ?? '其他资料', aliases: [], source: 'pdf', updatedAt: new Date().toISOString() });
  };
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) add('电子邮箱', email);
  const phone = text.match(/(?:\+?86[-\s]?)?1[3-9]\d{9}\b/)?.[0] ?? text.match(/(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}\b/)?.[0];
  if (phone) add('手机号码', phone);
  for (const platform of ['github', 'linkedin']) {
    const url = text.match(new RegExp(`(?:https?://)?(?:www\\.)?${platform}\\.com/[a-zA-Z0-9_./%-]+`, 'i'))?.[0];
    if (url) add(platform === 'github' ? 'GitHub' : 'LinkedIn', url.startsWith('http') ? url : `https://${url}`);
  }
  let active: typeof headings[number] | undefined;
  let buffer: string[] = [], uncategorized: string[] = [];
  const flush = () => { if (active && buffer.length) add(active.label, buffer.join('\n'), active.category); buffer = []; };
  for (const line of lines) {
    const heading = headings.find(h => h.names.some(name => normalize(name) === normalize(line)));
    if (heading) { flush(); active = heading; continue; }
    if (active) { buffer.push(line); continue; }
    let found = false;
    // Parse explicit key/value segments; avoid guessing a school/company from prose.
    for (const segment of line.split(/[|｜]/)) {
      const pair = segment.match(/^\s*([^:：]{1,36})[:：]\s*(.+)$/);
      const def = pair && definitions.find(d => !d.multiline && d.aliases.some(a => normalize(a) === normalize(pair[1])));
      if (pair && def) { add(def.label, pair[2]); found = true; }
    }
    if (!found) uncategorized.push(line);
  }
  flush();
  if (!items.some(i => i.label === '姓名')) {
    const candidate = lines.slice(0, 3).find(l => /^[\p{Script=Han}]{2,4}$/u.test(l) && !/简历|信息|技能|经历|介绍|背景|教育|求职|应聘/.test(l))
      ?? lines.slice(0, 2).find(l => /^[A-Z][a-z]+(?: [A-Z][a-z]+){1,3}$/.test(l) && !/resume|curriculum|vitae/i.test(l));
    if (candidate) { add('姓名', candidate); uncategorized = uncategorized.filter(l => l !== candidate); }
  }
  if (uncategorized.length) add('待整理文本', uncategorized.join('\n'), '其他资料');
  // The full text is kept in the draft editor separately, never used as an automatic answer.
  return items;
}
