import { definitionFor, definitions, normalize, type Definition } from './schema';
import type { Category, ItemGroup, ProfileItem } from './types';

type SectionKind = 'basic' | 'summary' | 'education' | 'work' | 'internship' | 'employment' | 'project' | 'skills' | 'awards' | 'other';
interface Section { kind: SectionKind; title: string; lines: string[] }
const sectionNames: Record<Exclude<SectionKind, 'other'>, string[]> = {
  basic: ['基本信息', '个人信息', '联系方式', 'personal information', 'contact information', 'contact details'],
  summary: ['个人简介', '自我评价', '个人总结', '自我介绍', 'summary', 'professional summary', 'profile', 'about me'],
  education: ['教育经历', '教育背景', '学习经历', '教育情况', '学历背景', '学术背景', 'education', 'education background', 'education history', 'academic background', 'academic qualifications', 'qualifications'],
  employment: ['工作与实习经历', '工作及实习经历', '工作和实习经历', '实习与工作经历', '实习及工作经历', '工作实习经历', '工作与实习经验', 'work and internship experience', 'work internship experience', 'professional and internship experience'],
  work: ['工作经历', '工作经验', '职业经历', '职业经验', '工作履历', '任职经历', '工作', 'work experience', 'professional experience', 'employment history', 'work history', 'employment experience', 'experience'],
  internship: ['实习经历', '实习经验', '实习实践', '实习', 'internship experience', 'internship history', 'internships', 'internship'],
  project: ['项目经历', '项目经验', '项目实践', '个人项目', '科研项目', '项目', 'projects', 'project experience', 'project history', 'selected projects', 'personal projects', 'research projects'],
  skills: ['专业技能', '技术技能', '技能', '技能清单', '技能特长', 'skills', 'technical skills'],
  awards: ['证书奖项', '荣誉奖项', '获奖经历', '资格证书', 'certifications', 'certificates', 'awards', 'honors'],
};
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripDecoration = (s: string) => s.normalize('NFKC').trim()
  .replace(/^[\s#*•·◆◇■□▶►【\[({]+/, '')
  .replace(/^(?:第\s*)?(?:\d{1,2}|[一二三四五六七八九十]+)(?:\s*[、.．)\]】:/|-]\s*|[章节部分]\s*)/, '')
  .replace(/^(?:\d{1,2}|[一二三四五六七八九十]+)\s+(?=[\p{Script=Han}A-Za-z])/u, '')
  .replace(/[\s:：\]】)}*#]+$/, '').trim();

function sectionKind(value: string): SectionKind | undefined {
  const title = stripDecoration(value);
  if (title.length > 100) return;
  const key = normalize(title).replace(/\d+$/, '');
  if (/^(?:工作(?:与|及|和)?实习|实习(?:与|及|和)?工作)(?:经历|经验|实践)$/.test(key)) return 'employment';
  const employmentChinese = sectionNames.employment.filter(n => /[\p{Script=Han}]/u.test(n)).map(normalize);
  const employmentEnglish = [...sectionNames.work, ...sectionNames.internship, ...sectionNames.employment].filter(n => !/[\p{Script=Han}]/u.test(n)).map(normalize);
  if (employmentChinese.some(a => employmentEnglish.some(b => key === a + b || key === b + a))) return 'employment';
  for (const [kind, names] of Object.entries(sectionNames) as [Exclude<SectionKind, 'other'>, string[]][]) {
    const keys = names.map(normalize);
    if (keys.includes(key) || keys.some(a => keys.some(b => a !== b && (key === a + b || key === a + 'and' + b)))) return kind;
  }
  if (/^(?:校园|社团|志愿|志愿者|社会|竞赛|科研|研究|课外|学生)(?:经历|经验|活动|工作|实践)$/.test(title)
    || /^(?:兴趣爱好|兴趣特长|语言能力|研究成果|发表论文|论文发表|个人荣誉|其他信息|其他经历|references|publications|volunteering|extracurricular activities|interests)$/i.test(title)) return 'other';
}

function heading(line: string): { kind: SectionKind; title: string; rest: string } | undefined {
  const kind = sectionKind(line);
  if (kind) return { kind, title: stripDecoration(line), rest: '' };
  const pair = line.match(/^(.{1,100}?)[：:]\s*(.*)$/);
  const inlineKind = pair && sectionKind(pair[1]);
  if (pair && inlineKind) return { kind: inlineKind, title: stripDecoration(pair[1]), rest: pair[2] };
}

export const projectLabels = ['项目名称', '项目职责', '项目时间', '项目描述', '职责内工作内容', '产出或结果'] as const;
const educationLabels = ['毕业院校', '成绩', '专业', '学科', '学院', '最高学历', '核心课程', '教育时间'] as const;
const dateAtom = '(?:19|20)\\d{2}(?:[./-]\\d{1,2}(?:[./-]\\d{1,2})?|年\\d{1,2}月(?:\\d{1,2}日)?)?';
const dateRange = new RegExp(`${dateAtom}\\s*(?:[-—–~～至]|to)\\s*(?:${dateAtom}|至今|现在|present|current)`, 'i');
const schoolPattern = /(?:[\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z .&'-]{0,65}?(?:大学|学院|学校|中学)|(?:[A-Z][\w&'.-]*\s+){0,7}(?:University|College|Institute(?: of Technology)?)\b(?: of [A-Z][\w.-]*(?: [A-Z][\w.-]*){0,3})?)/u;
const companyPattern = /(?:有限公司|有限责任公司|股份公司|科技公司|集团|事务所|\b(?:Inc\.?|Ltd\.?|Corporation|Company)\b)/i;

function fieldPairs(line: string, labels: readonly string[], category: Category): { prefix: string; pairs: { label: string; value: string }[] } {
  const defs = definitions.filter(d => labels.includes(d.label));
  const aliases = defs.flatMap(d => [d.label, ...d.aliases]).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(?:^|[\\s|｜;；])(${aliases.map(escapeRegex).join('|')})\\s*[:：]\\s*`, 'gi');
  const markers = Array.from(line.matchAll(pattern));
  return {
    prefix: markers.length ? line.slice(0, markers[0].index).trim() : line,
    pairs: markers.map((m, i) => ({
      label: definitionFor(m[1], category)!.label,
      value: line.slice(m.index! + m[0].length, markers[i + 1]?.index ?? line.length).replace(/[\s|｜;；]+$/, '').trim(),
    })),
  };
}

function bareField(line: string, labels: readonly string[], category: Category): Definition | undefined {
  const def = definitionFor(stripDecoration(line), category);
  return def && labels.includes(def.label) ? def : undefined;
}

export function parseResume(text: string): ProfileItem[] {
  const lines = text.split(/\r?\n/).map(l => l.replace(/[\t ]+/g, ' ').trim()).filter(Boolean);
  const sections: Section[] = [];
  let active: Section = { kind: 'basic', title: '', lines: [] };
  const flush = () => { if (active.lines.length) sections.push(active); };
  for (const line of lines) {
    const found = heading(line);
    if (found) {
      flush(); active = { kind: found.kind, title: found.title, lines: found.rest ? [found.rest] : [] }; continue;
    }
    // Recover explicit boundaries even when a PDF loses standalone chapter headings.
    const projectMarker = /^(?:项目名(?:称)?|项目描述|项目职责|project name|project title)\s*[:：]/i.test(line);
    const employmentMarker = active.kind === 'education' && (companyPattern.test(line) || /^(?:公司(?:名称)?|实习单位|工作单位|employer|company)\s*[:：]/i.test(line));
    if (projectMarker && active.kind !== 'project') {
      flush(); active = { kind: 'project', title: '项目经历', lines: [] };
    } else if (employmentMarker) {
      flush(); active = { kind: 'employment', title: '工作与实习经历', lines: [] };
    }
    active.lines.push(line);
  }
  flush();

  const items: ProfileItem[] = [];
  const uncategorized: string[] = [];
  let educationIndex = 0, projectIndex = 0;
  const add = (label: string, value: string, category: Category, group?: ItemGroup, allowEmpty = false) => {
    value = value.trim();
    if ((!value && !allowEmpty) || items.some(i => i.label === label && i.value === value && i.category === category && i.group?.id === group?.id)) return;
    items.push({ id: crypto.randomUUID(), label, value, category, aliases: [], source: 'pdf', updatedAt: new Date().toISOString(), ...(group ? { group: { ...group } } : {}) });
  };

  function parseEducation(section: Section) {
    let values = new Map<string, string[]>();
    let current: string | undefined;
    const append = (label: string, value: string) => { if (value.trim()) values.set(label, [...(values.get(label) ?? []), value.trim()]); current = label; };
    const finish = () => {
      if (!values.size) return;
      const name = values.get('毕业院校')?.join(' ') ?? '待确认学校';
      const group: ItemGroup = { id: crypto.randomUUID(), kind: 'education', name: name.slice(0, 160), index: ++educationIndex };
      for (const label of educationLabels) add(label, values.get(label)?.join('\n') ?? '', '教育经历', group);
      values = new Map(); current = undefined;
    };
    for (const line of section.lines) {
      const { prefix, pairs } = fieldPairs(line.replace(/\b(GPA|CGPA|WAM)\s*[:=]?\s*(?=\d)/gi, '$1: '), educationLabels, '教育经历');
      const standalone = bareField(line, educationLabels, '教育经历');
      if (standalone) {
        if (standalone.label === '毕业院校' && values.has('毕业院校')) finish();
        current = standalone.label; continue;
      }
      if (pairs.length) {
        if (pairs.some(p => p.label === '毕业院校') && values.has('毕业院校')) finish();
        if (prefix) infer(prefix);
        for (const pair of pairs) { append(pair.label, pair.value); current = !pair.value || pair.label === '核心课程' ? pair.label : undefined; }
        continue;
      }
      infer(line);
    }
    finish();

    function infer(line: string) {
      // Only academic signals or explicit academic fields enter education records.
      if (/^(?:[-•·*]\s*)?(?:负责|参与|开发|实现|搭建|实习|任职|就职|工作内容|项目|worked|developed|implemented|responsible for)/i.test(line)
        || companyPattern.test(line)) { uncategorized.push(`【教育章节待核对】${line}`); current = undefined; return; }
      const school = line.match(schoolPattern)?.[0]?.trim();
      const period = line.match(dateRange)?.[0];
      if (school) {
        if (values.has('毕业院校')) finish();
        append('毕业院校', school);
        if (period) append('教育时间', period);
        let rest = line.replace(school, '').replace(period ?? /$^/, '').replace(/^[\s|｜,，;；—–-]+|[\s|｜,，;；—–-]+$/g, '');
        const degree = rest.match(/(?:博士|硕士|本科|学士|专科|大专|高中|Ph\.?D\.?|Master(?:'s)?(?: of [A-Za-z ]+)?|Bachelor(?:'s)?(?: of [A-Za-z ]+)?)/i)?.[0];
        if (degree) { append('最高学历', degree); rest = rest.replace(degree, '').replace(/^[\s|｜,，;；—–-]+|[\s|｜,，;；—–-]+$/g, ''); }
        if (rest && rest.length <= 60 && !/[。！？!?]|实习|公司|工作|项目|负责|internship|employer|company|responsible/i.test(rest)) append('专业', rest);
        else if (rest) uncategorized.push(`【教育章节待核对】${rest}`);
        current = undefined; return;
      }
      if (period && line.replace(period, '').replace(/[\s|｜-]/g, '') === '') { append('教育时间', period); return; }
      if (current && line.length <= 140 && !/[。！？!?]/.test(line)) { const label = current; append(label, line); if (label !== '核心课程') current = undefined; return; }
      if (/^(?:计算机|软件|电子|机械|金融|经济|数学|物理|化学|生物|土木|通信|自动化|人工智能|数据科学|设计|法律|医学).{0,35}$/.test(line)) { append('专业', line); current = undefined; return; }
      uncategorized.push(`【教育章节待核对】${line}`);
    }
  }

  function parseProjects(section: Section) {
    let values = new Map<string, string[]>();
    let current: string | undefined;
    const append = (label: string, value: string) => { if (value.trim()) values.set(label, [...(values.get(label) ?? []), value.trim()]); };
    const finish = () => {
      if (!values.size) return;
      const name = values.get('项目名称')?.join(' ') ?? '待补充项目名';
      const group: ItemGroup = { id: crypto.randomUUID(), kind: 'project', name: name.slice(0, 160), index: ++projectIndex };
      for (const label of projectLabels) add(label, values.get(label)?.join('\n') ?? '', '项目经历', group, true);
      values = new Map(); current = undefined;
    };
    for (const line of section.lines) {
      const { prefix, pairs } = fieldPairs(line, projectLabels, '项目经历');
      const standalone = bareField(line, projectLabels, '项目经历');
      if (standalone) {
        if (standalone.label === '项目名称' && values.size) finish();
        current = standalone.label; continue;
      }
      if (pairs.length) {
        if (pairs.some(p => p.label === '项目名称') && values.size) finish();
        if (prefix) infer(prefix);
        for (const pair of pairs) { append(pair.label, pair.value); current = pair.value && ['项目名称', '项目职责', '项目时间'].includes(pair.label) ? undefined : pair.label; }
        continue;
      }
      const numbered = line.match(/^(?:项目\s*(?:[一二三四五六七八九十]|\d+)|project\s+\d+)\s*[、.：:)\]-]\s*(.+)$/i);
      if (numbered) { finish(); infer(numbered[1], true); continue; }
      const period = line.match(dateRange)?.[0];
      const title = period && line.replace(period, '').replace(/^[\s|｜—–-]+|[\s|｜—–-]+$/g, '');
      if (title && values.has('项目名称') && title.length < 80 && !/^[•·*\-]|[。！？!?]|^(?:负责|参与|开发|实现|完成|built|developed)/i.test(title)) { finish(); infer(line, true); continue; }
      infer(line);
    }
    finish();

    function infer(line: string, title = false) {
      const period = line.match(dateRange)?.[0];
      const rest = period ? line.replace(period, '').replace(/^[\s|｜—–-]+|[\s|｜—–-]+$/g, '') : line;
      if (title || (!current && !values.size && rest.length <= 80 && !/^[•·*\-]|[。！？!?]|^(?:负责|参与|开发|设计|实现|搭建|构建|优化|维护|提升|降低|完成|担任|作为|built|developed|implemented)/i.test(rest))) {
        if (rest) append('项目名称', rest);
        if (period) append('项目时间', period);
        return;
      }
      if (period && !rest) { append('项目时间', period); return; }
      if (current) { const label = current; append(label, line); if (['项目名称', '项目职责', '项目时间'].includes(label)) current = undefined; return; }
      const plain = line.replace(/^[•·*\-]\s*/, '');
      if (/^(?:担任|作为|角色|role\b)/i.test(plain)) append('项目职责', plain);
      else if (/^(?:产出|成果|结果|上线|获奖|获评|获得|outcome\b|result\b|achieved\b)|(?:提升|降低|减少|增长|缩短).{0,30}\d+\s*%/i.test(plain)) append('产出或结果', plain);
      else if (/^(?:负责|参与|开发|设计|实现|搭建|构建|优化|维护|完成|built\b|developed\b|implemented\b)/i.test(plain)) append('职责内工作内容', plain);
      else append('项目描述', line);
    }
  }

  function parseEmployment(section: Section) {
    const entries: string[][] = [];
    let entry: string[] = [];
    for (const line of section.lines) {
      const startsCompany = /^(?:公司(?:名称)?|工作单位|实习单位|company|employer)\s*[:：]/i.test(line)
        || (companyPattern.test(line) && line.length < 120 && !/^[•·*\-]|^(?:负责|参与|为|在)/.test(line));
      if (startsCompany && entry.length && entry.some(l => companyPattern.test(l) || /^(?:公司|工作单位|实习单位|company|employer)/i.test(l))) { entries.push(entry); entry = []; }
      entry.push(line);
    }
    if (entry.length) entries.push(entry);
    for (const lines of entries) {
      const isInternship = section.kind === 'internship' || lines.slice(0, 3).some(l => l.length < 140 && !/^[•·*\-]|^(?:负责|指导|带领|参与)/.test(l) && /实习生|实习(?:工程师|助理|岗位)|\bintern(?:ship)?\b/i.test(l));
      const category = isInternship ? '实习经历' : '工作经历';
      add(category, lines.join('\n'), category);
    }
  }

  // Do not infer the applicant's contact details from examples inside project prose.
  const header = sections.filter(s => s.kind === 'basic').flatMap(s => s.lines).join('\n');
  const email = header.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) add('电子邮箱', email, '基本信息');
  const phone = header.match(/(?:\+?86[-\s]?)?1[3-9]\d{9}\b/)?.[0] ?? header.match(/(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}\b/)?.[0];
  if (phone) add('手机号码', phone, '基本信息');
  for (const platform of ['github', 'linkedin']) {
    const url = header.match(new RegExp(`(?:https?://)?(?:www\\.)?${platform}\\.com/[a-zA-Z0-9_./%-]+`, 'i'))?.[0];
    if (url) add(platform === 'github' ? 'GitHub' : 'LinkedIn', url.startsWith('http') ? url : `https://${url}`, '基本信息');
  }
  for (const section of sections) {
    if (section.kind === 'education') { parseEducation(section); continue; }
    if (section.kind === 'project') { parseProjects(section); continue; }
    if (['work', 'internship', 'employment'].includes(section.kind)) { parseEmployment(section); continue; }
    if (section.kind === 'basic') {
      for (const line of section.lines) {
        let found = false;
        for (const segment of line.split(/[|｜]/)) {
          const pair = segment.match(/^\s*([^:：]{1,36})[:：]\s*(.+)$/);
          const def = pair && definitionFor(pair[1], '基本信息');
          if (pair && def && def.category === '基本信息') { add(def.label, pair[2], '基本信息'); found = true; }
        }
        if (!found) uncategorized.push(line);
      }
      continue;
    }
    const module = section.kind === 'summary' ? ['个人简介', '个人简介'] : section.kind === 'skills' ? ['专业技能', '技能证书'] : section.kind === 'awards' ? ['证书奖项', '技能证书'] : undefined;
    if (module) add(module[0], section.lines.join('\n'), module[1] as Category);
    else uncategorized.push(`【${section.title}】\n${section.lines.join('\n')}`);
  }
  if (!items.some(i => i.label === '姓名')) {
    const firstLines = sections.filter(s => s.kind === 'basic').flatMap(s => s.lines).slice(0, 3);
    const candidate = firstLines.find(l => /^[\p{Script=Han}]{2,4}$/u.test(l) && !/简历|信息|技能|经历|介绍|背景|教育|求职|应聘/.test(l))
      ?? firstLines.slice(0, 2).find(l => /^[A-Z][a-z]+(?: [A-Z][a-z]+){1,3}$/.test(l) && !/resume|curriculum|vitae/i.test(l));
    if (candidate) { add('姓名', candidate, '基本信息'); for (let i = uncategorized.length - 1; i >= 0; i--) if (uncategorized[i] === candidate) uncategorized.splice(i, 1); }
  }
  if (uncategorized.length) add('待整理文本', uncategorized.join('\n'), '其他资料');
  return items;
}
