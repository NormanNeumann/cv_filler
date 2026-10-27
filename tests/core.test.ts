// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseResume } from '../src/parser';
import { compatibleValue, matchField, sampleItems } from '../src/matcher';
import { cleanLabel, signatureFor } from '../src/schema';
import { emptyStore, rememberAnswers, validateStore } from '../src/storage';
import { createScanner } from '../src/scanner';
import type { FieldDraft, PageField, ProfileItem, Store } from '../src/types';

const item = (label: string, value = '答案', extra: Partial<ProfileItem> = {}): ProfileItem => ({ id: crypto.randomUUID(), label, value, category: '基本信息', aliases: [], source: 'manual', updatedAt: '', ...extra });
const storeOf = (...items: ProfileItem[]): Store => ({ ...emptyStore(), items });
const field = (label: string, extra: Partial<PageField> = {}): PageField => ({ id: 'f', label, hints: [], kind: 'text', context: '', signature: signatureFor(label, ''), inputType: 'text', currentValue: '', required: false, repeated: false, ...extra });

describe('PDF 文本归类', () => {
  it('提取中英文信息和经历模块，保留未识别的内容', () => {
    const result = parseResume('林知夏\n邮箱: lin@example.com | 手机: 13800138000\n上海\n个人简介\n喜欢设计和编程。\n教育背景\n同济大学 软件工程\n工作经历\n某公司\n负责产品开发\nProjects\nOpen source app\n技能\nTypeScript / React');
    const get = (label: string) => result.find(i => i.label === label)?.value;
    expect(get('姓名')).toBe('林知夏'); expect(get('电子邮箱')).toBe('lin@example.com'); expect(get('手机号码')).toBe('13800138000');
    expect(get('个人简介')).toBe('喜欢设计和编程。'); expect(get('毕业院校')).toBe('同济大学'); expect(get('工作经历')).toContain('负责产品开发');
    expect(get('项目名称')).toBe('Open source app'); expect(get('专业技能')).toBe('TypeScript / React'); expect(get('待整理文本')).toBe('上海');
  });
  it('不会把简历标题认作姓名，也不从经历段落猜公司和职位', () => {
    const result = parseResume('个人简历\n工作经历\n上海科技有限公司 软件工程师');
    expect(result.some(i => ['姓名', '公司名称', '职位名称'].includes(i.label))).toBe(false);
  });
  it('支持英文姓名与链接，并且不丢弃未知段落', () => {
    const result = parseResume('Alex Chen\nhttps://github.com/alex\nlinkedin.com/in/alex\nVolunteering at a library');
    expect(result.find(i => i.label === '姓名')?.value).toBe('Alex Chen');
    expect(result.find(i => i.label === 'LinkedIn')?.value).toBe('https://linkedin.com/in/alex');
    expect(result.find(i => i.label === '待整理文本')?.value).toContain('Volunteering');
  });
});

describe('字段匹配', () => {
  it('通过语义词典匹配中英文字段，不混淆全名与名', () => {
    const full = item('姓名', '林知夏'), mail = item('电子邮箱', 'lin@example.com');
    expect(matchField(field('Full name'), storeOf(full, mail))?.itemId).toBe(full.id);
    expect(matchField(field('Email address'), storeOf(full, mail))?.itemId).toBe(mail.id);
    expect(matchField(field('First name'), storeOf(full, mail))).toBeUndefined();
  });
  it('同分候选、重复字段、自定义控件均不默认匹配', () => {
    expect(matchField(field('姓名'), storeOf(item('姓名'), item('姓名')))).toBeUndefined();
    expect(matchField(field('姓名', { repeated: true }), storeOf(item('姓名')))).toBeUndefined();
    expect(matchField(field('姓名', { kind: 'unsupported' }), storeOf(item('姓名')))).toBeUndefined();
  });
  it('模块只填长文本，不把教育经历放进学校框', () => {
    const education = item('教育经历', '同济大学\n软件工程', { category: '教育经历' });
    expect(matchField(field('教育经历'), storeOf(education))).toBeUndefined();
    expect(matchField(field('education', { kind: 'multiline' }), storeOf(education))?.itemId).toBe(education.id);
    expect(matchField(field('学校'), storeOf(education))).toBeUndefined();
  });
  it('同义别名准确匹配，含糊名称不进行子字符串猜测', () => {
    const salary = item('期望薪资', '25K', { aliases: ['expected salary'] });
    expect(matchField(field('Expected salary'), storeOf(salary))?.itemId).toBe(salary.id);
    expect(matchField(field('确认邮箱'), storeOf(item('电子邮箱')))).toBeUndefined();
  });
  it('记忆跨网站复用，并区分教育与工作语境', () => {
    const start = item('开始时间', '2020-09', { source: 'memory', category: '问答记忆' });
    const store = storeOf(start); store.memories.push({ signature: signatureFor('开始时间', '教育经历'), itemId: start.id });
    expect(matchField(field('开始时间', { context: '教育背景', signature: signatureFor('开始时间', '教育背景') }), store)?.confidence).toBe('memory');
    expect(matchField(field('开始时间', { context: '工作经历', signature: signatureFor('开始时间', '工作经历') }), store)).toBeUndefined();
  });
  it('显式设置的问答别名可复用，但仍保留原问题语境', () => {
    const date = item('开始时间', '2020-09', { source: 'memory', category: '问答记忆', aliases: ['入学日期'] });
    const store = storeOf(date); store.memories.push({ signature: signatureFor('开始时间', '教育经历'), itemId: date.id });
    expect(matchField(field('入学日期', { context: '教育背景', signature: signatureFor('入学日期', '教育背景') }), store)?.itemId).toBe(date.id);
    expect(matchField(field('入学日期', { context: '工作经历', signature: signatureFor('入学日期', '工作经历') }), store)).toBeUndefined();
  });
});

describe('下拉与日期格式', () => {
  it('只选精确且唯一的下拉选项', () => {
    const select = field('学历', { kind: 'select', options: [{ value: 'bsc', label: '本科', disabled: false }, { value: 'msc', label: '硕士', disabled: false }] });
    expect(compatibleValue(select, '本科')).toEqual({ value: 'bsc' });
    expect(compatibleValue(select, '本')).toHaveProperty('reason');
    select.options!.push({ value: 'bsc2', label: '本科', disabled: false });
    expect(compatibleValue(select, '本科')).toHaveProperty('reason');
  });
  it('下拉值中的符号有意义，不把 C 误匹配到 C++', () => {
    expect(compatibleValue(field('语言', { kind: 'select', options: [{ value: 'cpp', label: 'C++', disabled: false }] }), 'C')).toHaveProperty('reason');
  });
  it('校验闰年并归一化中文日期', () => {
    expect(compatibleValue(field('日期', { kind: 'date' }), '2024年2月29日')).toEqual({ value: '2024-02-29' });
    expect(compatibleValue(field('日期', { kind: 'date' }), '2023-02-29')).toHaveProperty('reason');
    expect(compatibleValue(field('日期', { kind: 'date' }), '2024-02')).toHaveProperty('reason');
    expect(compatibleValue(field('月份', { kind: 'month' }), '2024年2月')).toEqual({ value: '2024-02' });
  });
});

describe('存储与记忆', () => {
  it('新答案记住一次，再次保存会更新同一记录', () => {
    const f = field('为什么想加入我们？');
    const draft: FieldDraft = { field: f, value: '喜欢产品', selected: true, remember: true, itemId: '' };
    const first = rememberAnswers(emptyStore(), [draft]);
    const second = rememberAnswers(first, [{ ...draft, value: '认同产品理念' }]);
    expect(second.items).toHaveLength(1); expect(second.memories).toHaveLength(1);
    expect(matchField(f, second)?.confidence).toBe('memory'); expect(second.items[0].value).toBe('认同产品理念');
  });
  it('取消记忆和重复字段不会被保存', () => {
    const draft: FieldDraft = { field: field('a'), value: 'b', selected: true, remember: false, itemId: '' };
    expect(rememberAnswers(emptyStore(), [draft]).items).toHaveLength(0);
    expect(rememberAnswers(emptyStore(), [{ ...draft, remember: true, field: field('a', { repeated: true }) }]).items).toHaveLength(0);
  });
  it('备份验证拒绝断开的记忆、重复 ID 和错误类型', () => {
    expect(() => validateStore({ ...emptyStore(), memories: [{ signature: '|a', itemId: 'missing' }] })).toThrow();
    const a = item('a'); expect(() => validateStore(storeOf(a, a))).toThrow();
    expect(() => validateStore({ ...emptyStore(), items: [{ ...a, value: 2 }] })).toThrow();
    expect(() => validateStore(storeOf({ ...a, id: '" onclick="bad' }))).toThrow();
    expect(validateStore(storeOf(...sampleItems())).items.length).toBeGreaterThan(5);
  });
});

describe('网页识别与填充', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function(this: HTMLElement) {
      return (this.closest('[style="display:none"]') ? [] : [{ x: 0, y: 0, width: 100, height: 20 }]) as unknown as DOMRectList;
    });
  });
  function mount(html: string) { document.body.innerHTML = html; const scanner = createScanner(document); return { scanner, scan: scanner.scan() }; }
  const request = (scan: ReturnType<ReturnType<typeof createScanner>['scan']>, f: PageField, value: string, overwrite = false) => ({ token: scan.token, values: [{ id: f.id, signature: f.signature, value, expectedValue: f.currentValue }], overwrite });

  it('识别 label/ARIA/placeholder 和原生控件，label 不混入下拉选项', () => {
    const { scan } = mount('<form><label>最高学历<select><option value="">请选择</option><option value="bsc">本科</option></select></label><label for="n">姓名（必填）：</label><input id="n"><span id="lbl">个人简介</span><textarea aria-labelledby="lbl"></textarea><input placeholder="电子邮箱"><input type="date" aria-label="出生日期"></form>');
    expect(scan.fields.map(f => f.label)).toEqual(['最高学历', '姓名', '个人简介', '电子邮箱', '出生日期']);
    expect(scan.fields.map(f => f.kind)).toEqual(['select', 'text', 'multiline', 'text', 'date']);
    expect(cleanLabel(' 姓名（必填）：')).toBe('姓名');
  });
  it('不扫描隐藏、只读、密码、验证码与文件上传', () => {
    const { scan } = mount('<input type="password"><input type="hidden"><input readonly><input disabled><input type="file"><label>验证码<input></label><div style="display:none"><input></div><input aria-label="姓名">');
    expect(scan.fields).toHaveLength(1); expect(scan.fields[0].label).toBe('姓名');
  });
  it('填写并触发网页事件，撤销后恢复', async () => {
    const { scanner, scan } = mount('<label>姓名<input></label>');
    const events: string[] = []; document.querySelector('input')!.addEventListener('input', () => events.push('input')); document.querySelector('input')!.addEventListener('change', () => events.push('change'));
    expect((await scanner.fill(request(scan, scan.fields[0], '林知夏')))[0].ok).toBe(true);
    expect(document.querySelector('input')!.value).toBe('林知夏'); expect(events).toEqual(['input','change']);
    expect(scanner.undo()).toEqual({ restored: 1, skipped: 0 }); expect(document.querySelector('input')!.value).toBe('');
  });
  it('原生下拉框与日期框正确转换', async () => {
    const { scanner, scan } = mount('<label>学历<select><option value="">请选择</option><option value="bsc">本科</option></select></label><input type="date" aria-label="生日">');
    expect((await scanner.fill(request(scan, scan.fields[0], '本科')))[0].ok).toBe(true);
    expect(document.querySelector('select')!.value).toBe('bsc');
    expect((await scanner.fill(request(scan, scan.fields[1], '1998年6月12日')))[0].ok).toBe(true);
    expect(document.querySelector('input')!.value).toBe('1998-06-12');
  });
  it('保护已有值，显式覆盖后可撤销，但不撤销用户后续修改', async () => {
    const { scanner, scan } = mount('<input aria-label="姓名" value="原值">');
    expect((await scanner.fill(request(scan, scan.fields[0], '新值')))[0].ok).toBe(false);
    expect((await scanner.fill(request(scan, scan.fields[0], '新值', true)))[0].ok).toBe(true);
    document.querySelector('input')!.value = '用户修改';
    expect(scanner.undo()).toEqual({ restored: 0, skipped: 1 }); expect(document.querySelector('input')!.value).toBe('用户修改');
  });
  it('字段被替换、内容被修改、token 过期时拒绝旧填充请求', async () => {
    const { scanner, scan } = mount('<input aria-label="姓名">');
    document.querySelector('input')!.value = '新内容';
    expect((await scanner.fill(request(scan, scan.fields[0], '旧答案', true)))[0].reason).toContain('已变化');
    document.body.innerHTML = '<input aria-label="姓名">';
    expect((await scanner.fill(request(scan, scan.fields[0], '旧答案')))[0].reason).toContain('替换');
    scanner.scan(); await expect(scanner.fill(request(scan, scan.fields[0], '旧答案'))).rejects.toThrow('页面已变化');
  });
  it('超长、格式不合法、框架拒绝的答案不报告成功', async () => {
    const { scanner, scan } = mount('<input aria-label="姓名" maxlength="2"><input type="email" aria-label="邮箱"><input aria-label="框架控件">');
    expect((await scanner.fill(request(scan, scan.fields[0], '三个字')))[0].reason).toContain('字限制');
    expect((await scanner.fill(request(scan, scan.fields[1], 'invalid')))[0].ok).toBe(false); expect(document.querySelector<HTMLInputElement>('[type=email]')!.value).toBe('');
    document.querySelectorAll('input')[2].addEventListener('input', event => { (event.target as HTMLInputElement).value = ''; });
    expect((await scanner.fill(request(scan, scan.fields[2], '新答案')))[0].reason).toContain('未接受');
  });
  it('按语境标记重复控件，报告自定义组合框和 iframe', () => {
    const { scan } = mount('<fieldset><legend>教育经历</legend><label>学校<input></label><label>学校<input></label></fieldset><input role="combobox" aria-label="城市"><iframe></iframe>');
    expect(scan.fields[0].repeated).toBe(true); expect(scan.fields[1].signature).toBe(scan.fields[0].signature);
    expect(scan.fields[0].context).toBe('教育经历'); expect(scan.fields[2].kind).toBe('unsupported'); expect(scan.frames).toBe(1);
  });
  it('缺少可读名称时，内部 name/id 只在本站复用', () => {
    const { scan } = mount('<input name="question1"><input aria-label="同一个问题">');
    expect(scan.fields[0].signature).toBe(`${document.location.origin}||question1`);
    expect(scan.fields[1].signature).toBe('|同一个问题');
  });
});
