import { icon } from './icons';
import { categories, type Category, type FieldDraft, type ProfileItem, type ScanResult } from './types';
import { emptyStore, inExtension, loadStore, rememberAnswers, saveStore, validateStore } from './storage';
import { compatibleValue, matchField, sampleItems } from './matcher';
import { parseResume } from './parser';
import { definitionFor } from './schema';
import { scanPage, fillPage, undoPage } from './bridge';

const e = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const app = document.querySelector<HTMLElement>('#app')!;
let store = emptyStore();
let tab: 'fill' | 'profile' | 'help' = 'fill';
let scan: ScanResult | undefined;
let drafts: FieldDraft[] = [];
let busy = false;
let hasUndo = false;
let overwrite = false;
let filter = '';
let activeCategory = '全部';
let toastTimer: ReturnType<typeof setTimeout>;
let importItems: ProfileItem[] = [];
let importedText = '';
let importFilename = '';
const preview = !inExtension();

function toast(message: string, error = false) {
  const node = document.querySelector<HTMLElement>('#toast')!;
  node.textContent = message;
  node.className = `visible${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.className = ''; }, error ? 8000 : 4500);
}

function render() {
  const demo = preview && !document.querySelector('#demo-frame');
  if (preview) document.body.classList.add('preview');
  // Keep the preview form alive while the panel re-renders.
  let shell = document.querySelector<HTMLElement>('#panel-shell');
  if (!shell) {
    app.innerHTML = `${preview ? `<aside class="preview-page"><div class="preview-bar"><span>${icon('logo')} 简历匣 / 交互预览</span><span>左侧为测试网页 · 右侧为插件</span></div><iframe id="demo-frame" title="求职表单测试网页" src="demo/form.html"></iframe></aside>` : ''}<div id="panel-shell"></div>`;
    shell = document.querySelector('#panel-shell')!;
  }
  shell.innerHTML = `
    <header class="brandbar"><div class="brand"><span class="brand-mark">${icon('logo')}</span><div><strong>简历匣<span class="version">BETA</span></strong><small>RESUME POCKET</small></div></div><span class="local-badge">${icon('shield')} 仅存本机</span></header>
    <nav class="tabs" aria-label="主导航">${[['fill', 'scan', '网页填充'], ['profile', 'book', '我的资料'], ['help', 'info', '使用说明']].map(([key, glyph, label]) => `<button data-action="tab" data-tab="${key}" class="tab ${tab === key ? 'active' : ''}" ${tab === key ? 'aria-current="page"' : ''}>${icon(glyph)}${label}${key === 'profile' && store.items.length ? `<span class="tab-count">${store.items.length}</span>` : ''}</button>`).join('')}</nav>
    <main>${tab === 'fill' ? fillView() : tab === 'profile' ? profileView() : helpView()}</main>
    ${tab === 'fill' ? footerView() : `<footer class="quiet-footer">${icon('shield')} 你的经历，留在你的设备里。</footer>`}
    ${dialogs()}`;
  updateFooter();
  if (demo) document.querySelector('#demo-frame')?.addEventListener('load', () => toast('预览已就绪，可先加载示例资料，再体验填充'));
}

function fillView(): string {
  const matched = drafts.filter(d => d.match).length;
  const unknown = drafts.filter(d => !d.match && d.field.kind !== 'unsupported').length;
  return `<section class="intro"><div class="eyebrow">LESS TYPING. MORE POSSIBILITIES.</div><h1>把时间留给<br>下一次机会<span class="accent-dot">.</span></h1><p>一份简历，填好每一次申请。</p></section>
    ${store.items.length === 0 ? `<section class="import-hero"><div class="import-icon">${icon('upload')}</div><h2>从你的简历开始</h2><p>导入 PDF，自动整理为可编辑的资料。<br>也可以手动添加，慢慢完善。</p><button class="btn primary" data-action="import">${icon('plus')} 导入简历</button><button class="text-button" data-action="add">手动添加资料 ${icon('arrow')}</button>${preview ? '<button class="preview-sample" data-action="sample">加载示例资料，体验填充</button>' : ''}</section>` : `<section class="profile-summary"><span class="summary-icon">${icon('book')}</span><div><strong>${e(store.items.find(i => i.label === '姓名')?.value || '我的简历资料')}</strong><p>${store.items.length} 条资料已就绪<span> · </span>${store.memories.length} 个问题已记住</p></div><button class="icon-button" title="管理我的资料" aria-label="管理我的资料" data-action="tab" data-tab="profile">${icon('chevron')}</button></section>`}
    <section class="page-section"><div class="section-title"><h2>当前网页</h2><button class="text-button" data-action="scan" ${busy ? 'disabled' : ''}>${icon('scan')} ${scan ? '重新识别' : '识别网页'}</button></div><div class="page-card"><span class="site-icon">${icon('globe')}</span><div><strong>${e(scan?.title || (preview ? 'Atelier · 加入我们' : '准备好你的申请页面'))}</strong><small>${scan ? e(safeHost(scan.url)) : '打开求职表单，点击识别即可开始'}</small></div><span class="status-dot ${scan ? 'ready' : ''}"></span></div>
    ${scan ? `<div class="scan-stats"><div><strong>${scan.fields.length}</strong><span>识别字段</span></div><div><strong class="blue">${matched}</strong><span>匹配资料</span></div><div><strong class="amber">${unknown}</strong><span>等待补充</span></div></div>` : `<div class="scan-empty">${icon('scan')}<p>让重复填写，到此为止。</p><span>识别字段后，可检查答案再一键填充。</span>${store.items.length ? `<button class="btn primary wide" data-action="quick-fill" ${busy ? 'disabled' : ''}>${icon('spark')} 识别并填充已知资料</button>` : ''}</div>`}</section>
    ${scan ? `<section class="fields-section"><div class="section-title"><h2>填充清单 <span class="muted-count">${drafts.length}</span></h2><span class="micro">检查后再出发</span></div>${drafts.length ? drafts.map(fieldView).join('') : '<div class="empty-small">此页面没有可填写的可见字段。<br>请打开申请表单，或展开下一步后重新识别。</div>'}${scan.skipped ? `<p class="scan-note">已跳过 ${scan.skipped} 个隐藏、只读或不适合填写的控件。</p>` : ''}${scan.frames ? `<p class="scan-note">页面含 ${scan.frames} 个内嵌框架。V1 仅识别主页面，请在新标签页打开内嵌表单。</p>` : ''}<label class="overwrite-option"><input type="checkbox" data-action="overwrite" ${overwrite ? 'checked' : ''}> 允许覆盖网页已有内容</label>${drafts.length ? '<button class="text-button save-answers" data-action="save-answers">仅保存已勾选的答案，暂不填网页</button>' : ''}</section>` : ''}
    <div class="privacy-note">${icon('shield')}<span>PDF 在本地解析，填写前由你掌控。<br>不会自动提交申请。</span></div>`;
}

function safeHost(url: string): string { try { return new URL(url).host || '本地网页'; } catch { return '当前网页'; } }
const typeLabel = (d: FieldDraft) => ({ text: '文本', multiline: '长文本', select: '下拉选择', date: '日期', month: '月份', unsupported: '自定义控件' })[d.field.kind];

function fieldView(d: FieldDraft): string {
  const f = d.field;
  const known = Boolean(d.match);
  const unsupported = f.kind === 'unsupported';
  const oneTimeOnly = f.repeated || f.label === '未命名字段';
  const selectValue = compatibleValue(f, d.value).value;
  const input = f.kind === 'select' ? `<select class="answer-input" data-field="${f.id}" data-action="value" aria-label="${e(f.label)}的答案"><option value="">请选择答案</option>${(f.options ?? []).filter(o => o.value).map(o => `<option value="${e(o.value)}" ${selectValue === o.value || d.value === o.value ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${e(o.label)}</option>`).join('')}</select>` : `<textarea class="answer-input" data-field="${f.id}" data-action="value" aria-label="${e(f.label)}的答案" rows="${f.kind === 'multiline' ? '3' : '1'}" placeholder="${f.kind === 'date' ? 'YYYY-MM-DD' : f.kind === 'month' ? 'YYYY-MM' : '输入一次，下次直接用'}" ${unsupported ? 'disabled' : ''}>${e(d.value)}</textarea>`;
  return `<article class="field-card ${known ? 'matched' : 'new'} ${unsupported ? 'unsupported' : ''}" data-card="${f.id}"><div class="field-heading"><label class="field-label"><input type="checkbox" data-action="select-field" data-field="${f.id}" ${d.selected ? 'checked' : ''} ${unsupported ? 'disabled' : ''}><strong>${e(f.label)}</strong>${f.required ? '<span class="required">*</span>' : ''}</label><span class="field-badge ${d.outcome?.ok ? 'success' : known ? 'known' : ''}">${d.outcome?.ok ? `${icon('check')} 已填充` : known ? `${icon( d.match!.confidence === 'memory' ? 'clock' : 'check')} ${d.match!.confidence === 'memory' ? '已记住' : '已匹配'}` : unsupported ? '需手动填写' : '待补充'}</span></div>
    <div class="field-meta">${e(typeLabel(d))}${f.context ? ` · ${e(f.context)}` : ''}${f.repeated ? ' · 存在同名字段，请逐项选择' : ''}</div>
    ${unsupported ? '<p class="scan-note">该网站使用自定义控件，请直接在网页操作。</p>' : `<select class="binding-select" data-action="bind" data-field="${f.id}" aria-label="为${e(f.label)}选择资料"><option value="">手动输入答案</option>${store.items.map(i => `<option value="${i.id}" ${d.itemId === i.id ? 'selected' : ''}>${e(i.category)} / ${e(i.label)}</option>`).join('')}</select>${input}<div class="field-bottom">${oneTimeOnly ? `<span>${f.repeated ? '同名字段本次填写，不建立通用记忆' : '字段缺少名称，仅本次填写'}</span>` : `<label><input type="checkbox" data-action="remember" data-field="${f.id}" ${d.remember ? 'checked' : ''}> 记住答案</label>`}${f.currentValue ? '<span>网页已有内容</span>' : !oneTimeOnly ? `<span>${known ? e(d.match!.reason) : '下次遇到自动匹配'}</span>` : ''}</div>`}
    ${d.outcome && !d.outcome.ok ? `<p class="field-error">${e(d.outcome.reason)}</p>` : ''}</article>`;
}

function footerView(): string {
  return `<footer class="fill-footer"><div class="footer-caption"><span id="selection-summary">先识别网页中的表单</span>${hasUndo ? `<button class="text-button" data-action="undo" ${busy ? 'disabled' : ''}>${icon('undo')} 撤销上次</button>` : '<span>由你确认，安心填写</span>'}</div><button id="fill-button" class="btn primary wide" data-action="fill" disabled>${icon('spark')} 一键填充 <span id="fill-count"></span>${icon('arrow')}</button></footer>`;
}

function updateFooter() {
  document.querySelectorAll<HTMLButtonElement>('[data-action="scan"],[data-action="quick-fill"],[data-action="undo"]').forEach(button => { button.disabled = busy; });
  const selected = drafts.filter(d => d.selected && d.value.trim() && d.field.kind !== 'unsupported');
  const button = document.querySelector<HTMLButtonElement>('#fill-button');
  if (button) button.disabled = busy || !selected.length;
  const count = document.querySelector('#fill-count');
  if (count) count.textContent = selected.length ? `${selected.length} 项` : '';
  const summary = document.querySelector('#selection-summary');
  if (summary && scan) summary.textContent = busy ? '正在处理…' : `已选择 ${selected.length} 项 · ${drafts.filter(d => !d.value.trim() && d.field.kind !== 'unsupported').length} 项待补充`;
}

function profileView(): string {
  const list = store.items.filter(i => (activeCategory === '全部' || i.category === activeCategory) && `${i.label} ${i.value}`.toLowerCase().includes(filter.toLowerCase()));
  return `<section class="profile-intro"><div class="eyebrow">YOUR STORY, IN ONE PLACE.</div><div class="title-row"><h1>我的资料<span class="accent-dot">.</span></h1><button class="btn small primary" data-action="add">${icon('plus')} 添加</button></div><p>修改一次，下次申请用上最新的你。</p></section>
    <div class="profile-toolbar"><button class="btn secondary" data-action="import">${icon('upload')} 导入简历</button><button class="btn secondary" data-action="export">${icon('download')} 备份</button><button class="icon-button" data-action="restore" title="恢复 JSON 备份" aria-label="恢复 JSON 备份">${icon('undo')}</button></div>
    <input class="search-input" type="search" placeholder="搜索姓名、技能、记住的答案…" aria-label="搜索资料" data-action="search" value="${e(filter)}">
    <div class="category-tabs" aria-label="资料分类">${['全部', ...categories.filter(c => store.items.some(i => i.category === c))].map(c => `<button data-action="category" data-category="${c}" class="${activeCategory === c ? 'active' : ''}">${c}</button>`).join('')}</div>
    <div id="profile-list">${list.length ? list.map(itemView).join('') : `<div class="profile-empty">${icon('book')}<h2>${store.items.length ? '没有找到相关资料' : '每一段经历，都值得被收好'}</h2><p>${store.items.length ? '试试其他关键词或分类。' : '导入简历，或添加你的第一条资料。'}</p>${!store.items.length && preview ? '<button class="btn secondary" data-action="sample">加载示例资料</button>' : ''}</div>`}</div>
    ${store.items.length ? '<p class="storage-hint">备份文件含个人资料，请保存在你信任的位置。卸载插件会删除本地记录。</p><button class="danger-link" data-action="clear">清空全部资料与记忆</button>' : ''}`;
}

function itemView(i: ProfileItem): string {
  return `<article class="profile-item"><div class="profile-item-title"><span class="category-label">${e(i.category)}</span><div class="item-actions"><button class="icon-button" data-action="edit" data-id="${i.id}" aria-label="编辑${e(i.label)}">${icon('edit')}</button><button class="icon-button danger" data-action="delete" data-id="${i.id}" aria-label="删除${e(i.label)}">${icon('trash')}</button></div></div><h3>${e(i.label)}</h3><p>${e(i.value)}</p><span class="item-source">${i.source === 'pdf' ? '从 PDF 整理' : i.source === 'memory' ? '来自问答记忆' : '手动维护'}${i.aliases.length ? ` · ${e(i.aliases.join('、'))}` : ''}</span></article>`;
}

function helpView(): string {
  return `<section class="profile-intro"><div class="eyebrow">A SMALL TOOL. A LITTLE MORE TIME.</div><h1>三步，少填一点<span class="accent-dot">.</span></h1><p>把重复的事交给简历匣。</p></section>
    <ol class="steps"><li><span>01</span><div><h2>收好你的经历</h2><p>导入有文字层的 PDF，或粘贴文本。检查自动归类结果，勾选要保存的模块。已有内容不会被导入覆盖。</p></div></li><li><span>02</span><div><h2>识别，检查，填充</h2><p>打开申请网页，点击工具栏图标授予当前页面访问权限。识别后检查字段和答案，一键填充。原生下拉框使用精确选项匹配，日期支持 YYYY-MM-DD。</p></div></li><li><span>03</span><div><h2>新的问题，只答一次</h2><p>在待补充字段输入答案，勾选“记住答案”。填充成功后保存，下次遇到相同问题自动匹配。也可点“仅保存答案”提前记住。</p></div></li></ol>
    <section class="help-card"><h2>${icon('shield')} 资料只留在本地</h2><p>解析、匹配和存储均在本机完成，无需账号或 API Key。插件不上传 PDF，不记录网页中手动输入的内容，也不会自动提交表单。</p><p>你主动填入网页的资料会受到该网站自身的数据处理规则约束。本地存储与导出的备份未加密。</p></section>
    <section class="help-card"><h2>V1 的适用范围</h2><p>支持可见文本框、长文本、可编辑文本区域、原生单选下拉框、日期及月份。扫描件 OCR、复杂双栏恢复、多段经历拆成重复表格、自定义下拉与日期组件、Shadow DOM、内嵌框架暂需手动处理。</p><p>同名重复字段不自动匹配。遇到动态表单，请展开后重新识别。默认保留网页原有内容，填充后请检查一次。</p></section>
    <button class="btn secondary wide" data-action="tab" data-tab="fill">开始填写 ${icon('arrow')}</button>`;
}

function dialogs(): string {
  return `<dialog id="edit-dialog"><form id="item-form"><div class="dialog-heading"><h2 id="edit-title">添加资料</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></div><input name="id" type="hidden"><label class="form-label">字段名称<input name="label" required maxlength="160" placeholder="如：期望薪资、可到岗时间"></label><label class="form-label">分类<select name="category">${categories.map(c => `<option>${c}</option>`).join('')}</select></label><label class="form-label">内容<textarea name="value" required rows="6" maxlength="100000" placeholder="写下这项资料的内容…"></textarea></label><label class="form-label">其他叫法 <span>可选，用逗号分隔</span><input name="aliases" placeholder="如：期望薪酬, expected salary"></label><p class="dialog-note">其他叫法帮助不同网站上的同义字段找到这条资料。</p><button class="btn primary wide" type="submit">保存资料 ${icon('check')}</button></form></dialog>
    <dialog id="import-dialog"><div class="dialog-heading"><div><div class="eyebrow">MAKE YOUR RESUME REUSABLE.</div><h2>导入你的简历</h2></div><button class="icon-button" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></div><div id="import-source"><label class="dropzone" id="dropzone">${icon('upload')}<strong>选择 PDF，或拖到这里</strong><span>文字版 PDF · 最大 20 MB · 最多 30 页</span><input id="pdf-input" type="file" accept=".pdf,application/pdf"></label><div class="divider"><span>或者</span></div><label class="form-label">粘贴简历文本<textarea id="paste-text" rows="7" placeholder="粘贴简历内容，自动识别基本信息、教育、工作、项目、技能…"></textarea></label><button class="btn primary wide" data-action="parse-text">整理文本 ${icon('arrow')}</button></div><p id="import-status" role="status" aria-live="polite"></p><div id="import-review" hidden></div></dialog>
    <dialog id="confirm-dialog"><h2 id="confirm-title"></h2><p id="confirm-message"></p><div class="confirm-actions"><button class="btn secondary" data-action="close-dialog">取消</button><button class="btn danger-btn" id="confirm-button">确认</button></div></dialog>
    <input type="file" id="backup-input" accept=".json,application/json" hidden>`;
}

function openDialog(id: string) { document.querySelector<HTMLDialogElement>(`#${id}`)!.showModal(); }
function closeDialog() { document.querySelector<HTMLDialogElement>('dialog[open]')?.close(); }
function askConfirm(title: string, message: string, action: () => Promise<void>) {
  document.querySelector('#confirm-title')!.textContent = title;
  document.querySelector('#confirm-message')!.textContent = message;
  const button = document.querySelector<HTMLButtonElement>('#confirm-button')!;
  button.onclick = () => run(async () => { closeDialog(); await action(); });
  openDialog('confirm-dialog');
}

function editItem(id?: string) {
  const item = store.items.find(i => i.id === id);
  const form = document.querySelector<HTMLFormElement>('#item-form')!;
  form.reset();
  const set = (name: string, value: string) => { (form.elements.namedItem(name) as HTMLInputElement).value = value; };
  if (item) { for (const key of ['id', 'label', 'value', 'category'] as const) set(key, item[key]); set('aliases', item.aliases.join(', ')); }
  document.querySelector('#edit-title')!.textContent = item ? '编辑资料' : '添加资料';
  openDialog('edit-dialog');
}

async function commit(next: typeof store) { store = await saveStore(next); }
async function run(action: () => Promise<void>) {
  if (busy) return;
  busy = true;
  document.querySelector('#panel-shell')?.setAttribute('aria-busy', 'true');
  updateFooter();
  try { await action(); } catch (error) { toast((error as Error).message || '操作失败，请重试', true); }
  finally { busy = false; document.querySelector('#panel-shell')?.removeAttribute('aria-busy'); updateFooter(); }
}

async function performScan() {
  const result = await scanPage();
  scan = result;
  drafts = result.fields.map(field => {
    const match = matchField(field, store);
    const item = store.items.find(i => i.id === match?.itemId);
    return { field, itemId: item?.id ?? '', value: item?.value ?? '', selected: Boolean(item?.value && !field.currentValue.trim() && compatibleValue(field, item.value).value !== undefined), remember: !field.repeated && field.label !== '未命名字段' && field.kind !== 'unsupported', match };
  });
  render();
}

async function performFill() {
  if (!scan) return;
  const selected = structuredClone(drafts.filter(d => d.selected && d.value.trim()));
  if (!selected.length) { toast('没有已选择且有答案的字段'); return; }
  const outcomes = await fillPage({ token: scan.token, overwrite, values: selected.map(d => ({ id: d.field.id, signature: d.field.signature, value: d.value, expectedValue: d.field.currentValue })) });
  const succeeded = selected.filter(d => outcomes.find(o => o.id === d.field.id)?.ok);
  for (const draft of selected) {
    draft.outcome = outcomes.find(o => o.id === draft.field.id);
    if (draft.outcome?.ok) { draft.field.currentValue = compatibleValue(draft.field, draft.value).value!; draft.selected = false; }
    const index = drafts.findIndex(d => d.field.id === draft.field.id);
    if (index >= 0) drafts[index] = draft;
  }
  hasUndo = succeeded.length > 0 || hasUndo;
  // Page writes cannot be rolled back by a storage failure; tell the user exactly what happened.
  let storageError = '';
  if (succeeded.some(d => d.remember)) {
    try { await commit(rememberAnswers(store, succeeded)); }
    catch (error) { storageError = `；但本地保存失败：${(error as Error).message}`; }
  }
  render();
  toast(`已填充 ${succeeded.length} 项${outcomes.length > succeeded.length ? `，${outcomes.length - succeeded.length} 项需检查` : ''}${storageError}`, Boolean(storageError));
}

function showImportReview() {
  importItems = parseResume(importedText);
  const node = document.querySelector<HTMLElement>('#import-review')!;
  document.querySelector<HTMLElement>('#import-source')!.hidden = true;
  node.hidden = false;
  document.querySelector('#import-status')!.textContent = `${importFilename || '粘贴文本'} · 整理出 ${importItems.length} 条资料，请检查后保存。`;
  node.innerHTML = `${importItems.map(i => `<article class="import-draft" data-import="${i.id}"><div class="import-row"><label><input type="checkbox" data-import-prop="selected" checked> 保存此项</label><select data-import-prop="category" aria-label="资料分类">${categories.filter(c => c !== '问答记忆').map(c => `<option ${c === i.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div><input data-import-prop="label" aria-label="资料名称" maxlength="160" value="${e(i.label)}"><textarea data-import-prop="value" aria-label="${e(i.label)}的内容" rows="${i.value.length > 90 ? 5 : 2}">${e(i.value)}</textarea></article>`).join('')}<details class="raw-text"><summary>查看提取的原始文本</summary><pre>${e(importedText)}</pre></details><p class="dialog-note">仅新增勾选内容，完全相同的记录会去重。已有资料不会被覆盖。双栏排版请特别核对阅读顺序。</p><button class="btn primary wide" data-action="save-import">保存选中资料 ${icon('check')}</button><button class="text-button" data-action="reset-import">重新导入</button>`;
}

async function readPdf(file: File) {
  const status = document.querySelector('#import-status')!;
  status.textContent = '正在本地解析 PDF…';
  try {
    const { extractPdf } = await import('./pdf');
    importedText = await extractPdf(file, (p, total) => { status.textContent = `正在解析第 ${p} / ${total} 页…`; });
    importFilename = file.name;
    showImportReview();
  } catch (error) { status.textContent = (error as Error).message; throw error; }
}

document.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target || target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
  const action = target.dataset.action;
  if (action === 'close-dialog') { closeDialog(); return; }
  if (busy) return;
  if (action === 'tab') { tab = target.dataset.tab as typeof tab; render(); return; }
  if (action === 'category') { activeCategory = target.dataset.category!; render(); return; }
  if (action === 'add' || action === 'edit') { editItem(target.dataset.id); return; }
  if (action === 'import') { render(); openDialog('import-dialog'); return; }
  if (action === 'reset-import') { closeDialog(); render(); openDialog('import-dialog'); return; }
  if (action === 'parse-text') {
    importedText = document.querySelector<HTMLTextAreaElement>('#paste-text')!.value.trim(); importFilename = '';
    if (!importedText) { toast('请先粘贴简历文本', true); return; }
    showImportReview(); return;
  }
  if (action === 'delete') {
    const item = store.items.find(i => i.id === target.dataset.id)!;
    askConfirm('删除这条资料？', `“${item.label}”及关联的问答记忆将被删除。`, async () => {
      await commit({ ...store, items: store.items.filter(i => i.id !== item.id), memories: store.memories.filter(m => m.itemId !== item.id) });
      invalidateMatches(); render(); toast('资料已删除');
    }); return;
  }
  if (action === 'clear') {
    askConfirm('清空全部资料？', '本机资料与问答记忆将全部删除。建议先导出备份，此操作不可撤销。', async () => { await commit({ ...emptyStore(), updatedAt: store.updatedAt }); drafts = []; scan = undefined; render(); toast('已清空本地资料'); }); return;
  }
  if (action === 'restore') { document.querySelector<HTMLInputElement>('#backup-input')!.click(); return; }
  if (action === 'export') {
    const url = URL.createObjectURL(new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `resume-pocket-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('备份已导出'); return;
  }
  run(async () => {
    if (action === 'scan') { await performScan(); toast(`识别到 ${scan!.fields.length} 个字段`); }
    if (action === 'quick-fill') { await performScan(); await performFill(); }
    if (action === 'fill') await performFill();
    if (action === 'save-answers') {
      const answers = drafts.filter(d => d.selected && d.remember && d.value.trim() && !d.field.repeated && d.field.label !== '未命名字段' && d.field.kind !== 'unsupported');
      if (!answers.length) throw new Error('请选择有内容且勾选“记住答案”的字段');
      await commit(rememberAnswers(store, answers));
      for (const draft of answers) {
        const match = matchField(draft.field, store);
        if (match) { draft.match = match; draft.itemId = match.itemId; }
      }
      render();
      toast(`已保存 ${answers.length} 个答案，下次识别时自动匹配`);
    }
    if (action === 'undo') { const result = await undoPage(); hasUndo = false; await performScan(); toast(`已撤销 ${result.restored} 项${result.skipped ? `，${result.skipped} 项因内容变化已保留` : ''}`); }
    if (action === 'sample') { const next = { ...store, items: [...store.items, ...sampleItems().filter(i => !store.items.some(j => j.label === i.label && j.value === i.value))] }; await commit(next); render(); toast('示例资料已加载，可随时修改或删除'); }
    if (action === 'save-import') {
      const selected = Array.from(document.querySelectorAll<HTMLElement>('[data-import]')).filter(n => n.querySelector<HTMLInputElement>('[data-import-prop="selected"]')!.checked).map(node => {
        const item = importItems.find(i => i.id === node.dataset.import)!;
        return { ...item, label: node.querySelector<HTMLInputElement>('[data-import-prop="label"]')!.value.trim(), value: node.querySelector<HTMLTextAreaElement>('[data-import-prop="value"]')!.value.trim(), category: node.querySelector<HTMLSelectElement>('[data-import-prop="category"]')!.value as Category };
      });
      if (selected.some(i => !i.label || !i.value)) throw new Error('选中的资料名称和内容不能为空');
      if (!selected.length) throw new Error('请至少选择一条资料');
      const additions: ProfileItem[] = [];
      for (const item of selected) if (![...store.items, ...additions].some(j => item.label === j.label && item.value === j.value)) additions.push(item);
      await commit({ ...store, items: [...store.items, ...additions] });
      closeDialog(); tab = 'profile'; activeCategory = '全部'; filter = ''; invalidateMatches(); render(); toast(`已新增 ${additions.length} 条资料，跳过 ${selected.length - additions.length} 条重复记录`);
    }
  });
});

function invalidateMatches() {
  // Invalidate the scan so edited/deleted profile records are never filled from a stale draft.
  scan = undefined; drafts = [];
}

document.addEventListener('input', event => {
  const input = event.target as HTMLInputElement;
  const action = input.dataset.action;
  if (action === 'search') {
    filter = input.value;
    const start = input.selectionStart;
    render();
    const next = document.querySelector<HTMLInputElement>('[data-action="search"]')!;
    next.focus(); next.setSelectionRange(start, start);
  }
  if (action === 'value') {
    const draft = drafts.find(d => d.field.id === input.dataset.field)!;
    // Remember the human-readable option, since every website uses different internal values.
    draft.value = input instanceof HTMLSelectElement && input.value ? input.selectedOptions[0].label.trim() : input.value;
    draft.outcome = undefined;
    draft.selected = Boolean(draft.value.trim()) && (!draft.field.currentValue.trim() || overwrite);
    const checkbox = document.querySelector<HTMLInputElement>(`[data-action="select-field"][data-field="${draft.field.id}"]`);
    if (checkbox) checkbox.checked = draft.selected;
    updateFooter();
  }
});

document.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'pdf-input' && input.files?.[0]) { const file = input.files[0]; run(() => readPdf(file)); }
  if (input.id === 'backup-input' && input.files?.[0]) {
    const file = input.files[0];
    run(async () => {
      if (file.size > 8 * 1024 * 1024) throw new Error('备份文件过大');
      const backup = validateStore(JSON.parse(await file.text()));
      askConfirm('恢复这份备份？', `将以备份中的 ${backup.items.length} 条资料和 ${backup.memories.length} 个记忆替换本机记录。`, async () => {
        await commit({ ...backup, updatedAt: store.updatedAt }); invalidateMatches(); render(); toast('备份已恢复');
      });
    });
  }
  if (input.dataset.action === 'overwrite') { overwrite = input.checked; return; }
  const draft = drafts.find(d => d.field.id === input.dataset.field);
  if (!draft) return;
  if (input.dataset.action === 'select-field') draft.selected = input.checked;
  if (input.dataset.action === 'remember') draft.remember = input.checked;
  if (input.dataset.action === 'bind') {
    const item = store.items.find(i => i.id === input.value);
    draft.itemId = item?.id ?? ''; draft.value = item?.value ?? ''; draft.match = undefined; draft.outcome = undefined;
    draft.selected = Boolean(item?.value && (!draft.field.currentValue.trim() || overwrite) && compatibleValue(draft.field, item.value).value !== undefined);
    render();
  }
  updateFooter();
});

document.addEventListener('submit', event => {
  if ((event.target as HTMLElement).getAttribute('id') !== 'item-form') return;
  event.preventDefault();
  const form = new FormData(event.target as HTMLFormElement);
  run(async () => {
    const id = String(form.get('id'));
    const old = store.items.find(i => i.id === id);
    const label = String(form.get('label')).trim();
    const item: ProfileItem = {
      id: id || crypto.randomUUID(), label, value: String(form.get('value')).trim(), category: String(form.get('category')) as Category,
      aliases: String(form.get('aliases')).split(/[,，、]/).map(s => s.trim()).filter(Boolean), source: old?.source ?? 'manual', updatedAt: new Date().toISOString(),
    };
    if (!item.label || !item.value) throw new Error('字段名称和内容不能为空');
    await commit({ ...store, items: old ? store.items.map(i => i.id === id ? item : i) : [...store.items, item] });
    closeDialog(); invalidateMatches(); render(); toast('资料已保存');
  });
});

document.addEventListener('dragover', event => { if ((event.target as HTMLElement).closest('#dropzone')) { event.preventDefault(); } });
document.addEventListener('drop', event => {
  if (!(event.target as HTMLElement).closest('#dropzone')) return;
  event.preventDefault();
  const file = event.dataTransfer?.files[0];
  if (file) run(() => readPdf(file));
});

try { store = await loadStore(); } catch (error) { toast(`本地资料读取失败：${(error as Error).message}`, true); }
render();
