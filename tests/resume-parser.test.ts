import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseResume, projectLabels } from '../src/parser';
import { mergeImportedItems, refreshGroupNames } from '../src/profile';
import { matchField } from '../src/matcher';
import { emptyStore, rememberAnswers, validateStore } from '../src/storage';
import { signatureFor } from '../src/schema';
import type { PageField, ProfileItem } from '../src/types';

const fixture = readFileSync(new URL('./fixtures/experience-resume.txt', import.meta.url), 'utf8');
const textOf = (items: ProfileItem[], category: string) => items.filter(i => i.category === category).map(i => i.value).join('\n');
const field = (label: string, context: string, kind: PageField['kind'] = 'text'): PageField => ({ id: 'field', label, context, kind, hints: [], signature: signatureFor(label, context), inputType: 'text', currentValue: '', required: false, repeated: false });

describe('章节边界回归', () => {
  it('教育只保留学业字段，编号、空格、双语、合并标题不会造成跨章吞并', () => {
    const items = parseResume(fixture);
    const education = items.filter(i => i.category === '教育经历');
    expect(education.map(i => i.label)).toEqual(['毕业院校', '成绩', '专业', '学科', '最高学历', '教育时间']);
    expect(education.find(i => i.label === '成绩')?.value).toBe('3.8/4.0');
    expect(textOf(items, '教育经历')).not.toMatch(/示例|实习|预约|组件|负责/);
    expect(textOf(items, '实习经历')).toContain('前端实习生');
    expect(textOf(items, '工作经历')).toContain('组件库');
    expect(textOf(items, '工作经历')).not.toMatch(/简历匣|校园预约|实习生/);
    expect(textOf(items, '其他资料')).toContain('技术分享');
  });
  it('教育、实习、工作、项目的顺序任意调整后仍隔离', () => {
    const sections = ['教育背景\n学校：同济大学\n专业：软件工程', '实习经历 Internship Experience\n实习单位：甲公司\n参与测试。', '工作履历\n乙公司\n负责产品维护。', '项目经历\n项目名称：预约平台\n项目描述：预订场馆。'];
    for (const order of [sections, sections.toReversed(), [sections[1], sections[3], sections[0], sections[2]]]) {
      const items = parseResume(order.join('\n'));
      expect(textOf(items, '教育经历')).toBe('同济大学\n软件工程');
      expect(textOf(items, '实习经历')).toContain('甲公司');
      expect(textOf(items, '工作经历')).toContain('乙公司');
      expect(textOf(items, '项目经历')).toContain('预约平台');
      expect(textOf(items, '工作经历')).not.toContain('预订场馆');
    }
  });
  it('冒号后同行的章节内容不丢失', () => {
    const items = parseResume('教育背景：学校：同济大学 | 专业：软件工程\n实习经历：示例公司 前端实习生\n工作经历：另一家公司 软件工程师\n项目经历：项目名称：简历匣 | 职责：负责人');
    expect(textOf(items, '教育经历')).toContain('同济大学');
    expect(textOf(items, '实习经历')).toContain('示例公司');
    expect(textOf(items, '工作经历')).toContain('另一家');
    expect(items.find(i => i.label === '项目职责')?.value).toBe('负责人');
  });
  it('没有章节标题时，明确的公司与项目字段仍是边界', () => {
    const items = parseResume('教育背景\n学校：同济大学\n专业：软件工程\n公司：示例科技有限公司\n职位：实习生\n负责用户反馈。\n项目名称：简历匣\n项目描述：本地填表工具。');
    expect(textOf(items, '教育经历')).not.toMatch(/公司|反馈|简历匣/);
    expect(textOf(items, '实习经历')).toContain('用户反馈');
    expect(textOf(items, '实习经历')).not.toContain('本地填表');
    expect(items.find(i => i.label === '项目名称')?.value).toBe('简历匣');
  });
  it('未知的教育正文进入待整理，不附到 GPA 或专业上', () => {
    const items = parseResume('教育背景\n学校：同济大学\nGPA：3.8/4.0\n负责开发招聘系统。\n参与公司平台重构。\n项目描述：表单工具。');
    expect(textOf(items, '教育经历')).toBe('同济大学\n3.8/4.0');
    expect(textOf(items, '其他资料')).toContain('招聘系统');
    expect(items.find(i => i.label === '项目描述')?.value).toBe('表单工具。');
  });
  it('学校行可拆专业、学历和时间，多个学校分别分组', () => {
    const items = parseResume('教育经历\n2020.09 - 2024.06 同济大学 软件工程 本科\nGPA: 3.8/4.0\n2024.09 - 2026.06 悉尼大学 计算机科学 硕士\nWAM: 85/100');
    expect(items.filter(i => i.label === '毕业院校').map(i => i.value)).toEqual(['同济大学', '悉尼大学']);
    expect(items.filter(i => i.label === '专业').map(i => i.value)).toEqual(['软件工程', '计算机科学']);
    expect(new Set(items.filter(i => i.category === '教育经历').map(i => i.group?.id)).size).toBe(2);
  });
  it('工作描述中提到指导实习生，不会将正式工作改为实习', () => {
    const items = parseResume('工作经历\n示例科技有限公司\n负责指导实习生并维护页面。');
    expect(textOf(items, '工作经历')).toContain('指导实习生');
    expect(items.some(i => i.category === '实习经历')).toBe(false);
  });
  it('学校行上混排的非学业文字不会被当成专业', () => {
    const items = parseResume('教育背景\n同济大学 参与实习项目\nGPA: 3.8/4.0');
    expect(items.find(i => i.label === '毕业院校')?.value).toBe('同济大学');
    expect(items.some(i => i.label === '专业')).toBe(false);
    expect(textOf(items, '其他资料')).toContain('参与实习项目');
  });
});

describe('项目六类字段', () => {
  it('两个项目各自拥有六类字段，共用职责文本也不合并', () => {
    const projects = parseResume(fixture).filter(i => i.category === '项目经历');
    const ids = [...new Set(projects.map(i => i.group!.id))];
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(projects.filter(i => i.group?.id === id).map(i => i.label)).toEqual([...projectLabels]);
    const first = projects.filter(i => i.group?.id === ids[0]);
    expect(first.find(i => i.label === '项目名称')?.value).toBe('简历匣');
    expect(first.find(i => i.label === '项目职责')?.value).toBe('前端负责人');
    expect(first.find(i => i.label === '项目时间')?.value).toBe('2026.09 - 2026.10');
    expect(first.find(i => i.label === '项目描述')?.value).toContain('本地整理');
    expect(first.find(i => i.label === '职责内工作内容')?.value).toContain('实现 PDF 解析');
    expect(first.find(i => i.label === '产出或结果')?.value).toContain('60%');
    expect(projects.filter(i => i.label === '项目职责' && i.value === '前端负责人')).toHaveLength(2);
  });
  it('英文名称、角色、日期、描述、贡献和结果分别映射', () => {
    const items = parseResume('Selected Projects\nProject Name: Resume Pocket\nRole: Frontend Lead\nDuration: 2026-09 to 2026-10\nDescription: Local resume assistant.\nContributions: Built the parser.\nResults: Reduced typing by 60%.');
    expect(items.filter(i => i.category === '项目经历').map(i => i.value)).toEqual(['Resume Pocket', 'Frontend Lead', '2026-09 to 2026-10', 'Local resume assistant.', 'Built the parser.', 'Reduced typing by 60%.']);
    expect(items.some(i => i.category === '工作经历')).toBe(false);
  });
  it('独立字段名后的多行内容不串字段', () => {
    const items = parseResume('项目经验\n项目名\n简历匣\n职责\n前端负责人\n项目描述\n这是一个本地工具。\n支持 PDF。\n工作内容\n负责解析。\n实现匹配。\n结果\n已上线。');
    expect(items.find(i => i.label === '项目描述')?.value).toBe('这是一个本地工具。\n支持 PDF。');
    expect(items.find(i => i.label === '职责内工作内容')?.value).toBe('负责解析。\n实现匹配。');
    expect(items.find(i => i.label === '产出或结果')?.value).toBe('已上线。');
  });
  it('编号项目和带日期的项目标题可以启动新项目', () => {
    const items = parseResume('项目经历\n项目一：简历匣\n担任前端负责人\n负责解析 PDF\n填写时间降低 60%\n校园系统 2023.01 - 2023.06\n开发预约功能\n项目二：任务助手\n项目描述：管理任务。');
    expect(items.filter(i => i.label === '项目名称').map(i => i.value)).toEqual(['简历匣', '校园系统', '任务助手']);
    expect(items.find(i => i.label === '产出或结果' && i.value)?.value).toContain('60%');
  });
  it('简历没写的字段留空，不编造职责、时间或结果', () => {
    const items = parseResume('项目经历\n项目名称：简历匣\n项目描述：本地工具。');
    expect(items.filter(i => i.category === '项目经历')).toHaveLength(6);
    expect(items.filter(i => i.value === '').map(i => i.label)).toEqual(['项目职责', '项目时间', '职责内工作内容', '产出或结果']);
  });
  it('标量字段填完后，无标签正文不会继续拼进项目名称或职责', () => {
    const items = parseResume('项目经验\n项目名称：简历匣\n这是一个本地简历工具。\n职责：前端负责人\n负责解析 PDF\n开发表单匹配功能\n填写时间降低 60%');
    expect(items.find(i => i.label === '项目名称')?.value).toBe('简历匣');
    expect(items.find(i => i.label === '项目职责')?.value).toBe('前端负责人');
    expect(items.find(i => i.label === '项目描述')?.value).toBe('这是一个本地简历工具。');
    expect(items.find(i => i.label === '职责内工作内容')?.value).toBe('负责解析 PDF\n开发表单匹配功能');
    expect(items.find(i => i.label === '产出或结果')?.value).toContain('60%');
  });
  it('完整日期范围可从项目标题拆出', () => {
    const items = parseResume('项目经历\n简历匣 2026年9月1日 - 2026年10月28日\n负责开发扩展');
    expect(items.find(i => i.label === '项目名称')?.value).toBe('简历匣');
    expect(items.find(i => i.label === '项目时间')?.value).toBe('2026年9月1日 - 2026年10月28日');
  });
});

describe('分组维护、备份与填充', () => {
  const projectItems = () => parseResume(fixture).filter(i => i.category === '项目经历' && i.value.trim());
  it('新分组可以保存与恢复，旧版无分组记录继续可读', () => {
    const items = projectItems();
    expect(validateStore({ ...emptyStore(), items }).items).toEqual(items);
    const { group, ...oldItem } = items[0];
    expect(validateStore({ ...emptyStore(), items: [oldItem] }).items).toEqual([oldItem]);
    expect(() => validateStore({ ...emptyStore(), items: [{ ...items[0], group: { ...group, index: -1 } }] })).toThrow('分组格式');
  });
  it('重新导入相同简历去重，两个项目的相同职责均保留', () => {
    const first = mergeImportedItems([], projectItems());
    const second = mergeImportedItems(first.items, projectItems());
    expect(first.added).toBe(12); expect(second.added).toBe(0);
    expect(second.items.filter(i => i.label === '项目职责')).toHaveLength(2);
    expect(new Set(second.items.map(i => i.group!.id)).size).toBe(2);
  });
  it('编辑项目名会更新该项目的所有字段，不改其他项目', () => {
    const items = projectItems();
    const changed = refreshGroupNames(items.map(i => i.label === '项目名称' && i.value === '简历匣' ? { ...i, value: '简历匣 Pro' } : i));
    expect(changed.filter(i => i.group?.index === 1).every(i => i.group?.name === '简历匣 Pro')).toBe(true);
    expect(changed.filter(i => i.group?.index === 2).every(i => i.group?.name === '校园预约系统')).toBe(true);
  });
  it('单项目的角色和描述匹配正确，不把项目描述当整段经历或职位', () => {
    const items = projectItems().filter(i => i.group?.index === 1);
    const store = { ...emptyStore(), items };
    expect(matchField(field('Role', '项目经历'), store)?.itemId).toBe(items.find(i => i.label === '项目职责')?.id);
    expect(matchField(field('Project description', '项目经历', 'multiline'), store)?.itemId).toBe(items.find(i => i.label === '项目描述')?.id);
    expect(matchField(field('Role', '工作经历'), store)).toBeUndefined();
    expect(matchField(field('工作内容', '', 'multiline'), store)).toBeUndefined();
  });
  it('多个项目不猜测对应项，手选后不记成其他项目的通用答案', () => {
    const items = projectItems();
    const store = { ...emptyStore(), items };
    const roleField = field('职责', '项目经历');
    expect(matchField(roleField, store)).toBeUndefined();
    const role = items.find(i => i.label === '项目职责')!;
    const remembered = rememberAnswers(store, [{ field: roleField, itemId: role.id, value: role.value, selected: true, remember: true }]);
    expect(remembered.memories).toHaveLength(0);
  });
});
