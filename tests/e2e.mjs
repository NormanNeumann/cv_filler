import { chromium } from 'playwright';
import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildExtension, root } from '../scripts/build.mjs';

const results = path.join(root, 'test-results');
await mkdir(results, { recursive: true });
await buildExtension();
let server;
try { await fetch('http://127.0.0.1:4173/panel.html'); }
catch { server = spawn(process.execPath, ['scripts/dev.mjs', '--no-build'], { cwd: root, windowsHide: true, stdio: 'pipe' }); }
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4173/panel.html')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const pdfPage = pdf.addPage();
['Alex Chen', 'Email: alex@example.com', 'Phone: +61 412 345 678', 'Professional Summary', 'Frontend engineer who cares about accessible products.', 'Education', 'Example University - Software Engineering', 'Work Experience', 'Built reliable interfaces with a small product team.', 'Skills', 'TypeScript, React, CSS'].forEach((line, i) => pdfPage.drawText(line, { x: 50, y: 780 - i * 30, size: 12, font }));
const pdfFile = path.join(results, 'resume-fixture.pdf');
await writeFile(pdfFile, await pdf.save());
// A standard CJK CID font exercises the bundled Adobe CMaps without downloading a font.
const chinesePdf = await PDFDocument.create();
const chinesePage = chinesePdf.addPage();
const cid = chinesePdf.context.register(chinesePdf.context.obj({
  Type: 'Font', Subtype: 'CIDFontType0', BaseFont: 'STSong-Light',
  CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('GB1'), Supplement: 4 },
}));
const cjkFont = chinesePdf.context.register(chinesePdf.context.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'STSong-Light', Encoding: 'UniGB-UCS2-H', DescendantFonts: [cid] }));
chinesePage.node.setFontDictionary(PDFName.of('CJK'), cjkFont);
const chineseLines = ['林知夏', '姓名：林知夏', '教育经历', '同济大学 软件工程', '工作经历', '负责产品体验与前端开发', '专业技能', '交互设计与软件开发'];
const stream = chineseLines.map((s, i) => `BT /CJK 12 Tf 50 ${780 - i * 30} Td <${Array.from(s).map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}> Tj ET`).join('\n');
chinesePage.node.addContentStream(chinesePdf.context.register(chinesePdf.context.flateStream(stream)));
const chineseFile = path.join(results, 'chinese-resume-fixture.pdf');
await writeFile(chineseFile, await chinesePdf.save());

let browser, context, currentPage;
const errors = [];
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  currentPage = page;
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/panel.html');
  await page.getByRole('heading', { name: '从你的简历开始' }).waitFor();
  await page.screenshot({ path: path.join(results, 'preview-empty.png'), fullPage: true });
  await page.getByRole('button', { name: '加载示例资料，体验填充' }).click();
  await page.getByRole('button', { name: '识别并填充已知资料' }).click();
  await page.getByText('已填充 7 项', { exact: true }).waitFor();
  const frame = page.frameLocator('#demo-frame');
  assert.equal(await frame.locator('[name=fullName]').inputValue(), '林知夏');
  assert.equal(await frame.locator('[name=degree]').inputValue(), 'bachelor');
  assert.equal(await frame.locator('[name=birthday]').inputValue(), '1998-06-12');
  await page.getByLabel(/为什么想加入我们.*的答案/).fill('认同团队对产品细节与用户体验的追求。');
  await page.getByLabel('期望薪资的答案').fill('25–30K / 月');
  await page.getByLabel('可到岗日期的答案').fill('2026-11-16');
  await page.locator('#fill-button').click();
  await page.getByText('已填充 3 项', { exact: true }).waitFor();
  assert.equal(await frame.locator('[name=motivation]').inputValue(), '认同团队对产品细节与用户体验的追求。');
  await page.screenshot({ path: path.join(results, 'preview-filled.png'), fullPage: true });
  await page.getByLabel('允许覆盖网页已有内容').check();
  await page.getByLabel('最高学历的答案').selectOption('master');
  await page.locator('#fill-button').click();
  await page.getByText('已填充 1 项', { exact: true }).waitFor();
  const semanticStore = await page.evaluate(() => JSON.parse(localStorage.getItem('resume-pocket-v1')));
  const degreeMemory = semanticStore.memories.find(m => m.signature === '|最高学历');
  assert.equal(semanticStore.items.find(i => i.id === degreeMemory.itemId).value, '硕士');
  await page.reload();
  await page.getByRole('button', { name: '识别并填充已知资料' }).click();
  await page.getByText('已填充 10 项', { exact: true }).waitFor();
  assert.equal(await frame.locator('[name=salary]').inputValue(), '25–30K / 月');
  assert.equal(await frame.locator('[name=degree]').inputValue(), 'master');
  await page.getByRole('button', { name: '撤销上次' }).click();
  await page.getByText('已撤销 10 项', { exact: true }).waitFor();
  assert.equal(await frame.locator('[name=fullName]').inputValue(), '');

  await page.getByRole('button', { name: /^我的资料/ }).click();
  await page.getByLabel('编辑期望薪资', { exact: true }).click();
  await page.locator('#item-form [name=value]').fill('30–35K / 月');
  await page.getByRole('button', { name: '保存资料' }).click();
  await page.getByText('资料已保存', { exact: true }).waitFor();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action=export]').click()]);
  const backupFile = path.join(results, 'backup-fixture.json');
  await download.saveAs(backupFile);
  await page.locator('[data-action=clear]').click();
  await page.locator('#confirm-button').click();
  await page.getByText('已清空本地资料', { exact: true }).waitFor();
  await page.locator('#backup-input').setInputFiles(backupFile);
  await page.locator('#confirm-button').click();
  await page.getByText('备份已恢复', { exact: true }).waitFor();
  await page.getByText('30–35K / 月', { exact: true }).waitFor();
  await page.getByRole('button', { name: '导入简历', exact: true }).click();
  await page.locator('#pdf-input').setInputFiles(pdfFile);
  await page.getByRole('button', { name: '保存选中资料' }).waitFor({ timeout: 30000 });
  assert.ok(await page.locator('[data-import-prop=value]').filter({ hasText: 'alex@example.com' }).count());
  await page.getByRole('button', { name: '保存选中资料' }).click();
  await page.getByText('Alex Chen', { exact: true }).waitFor();
  assert.equal(errors.length, 0, `preview errors: ${errors.join('; ')}`);
  console.log('PASS: preview import, native select/date fill, persistent Q&A memory, editing, undo, backup and restore');

  for (const width of [320, 400]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `horizontal overflow at ${width}`);
  }
  await page.screenshot({ path: path.join(results, 'panel-mobile.png'), fullPage: true });
  await browser.close(); browser = undefined;

  // Load the exact distributable manifest, with no host_permissions.
  const extension = path.join(results, 'extension');
  await cp(path.join(root, 'dist'), extension, { recursive: true });
  try {
    context = await chromium.launchPersistentContext(path.join(results, `chrome-profile-${Date.now()}`), {
      channel: 'chromium', headless: true, viewport: { width: 1100, height: 950 },
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--enable-unsafe-extension-debugging', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
  } catch (error) {
    console.log('Chrome for Testing unavailable; using an isolated installed-Chrome profile with CDP extension loading.');
    context = await chromium.launchPersistentContext(path.join(results, `chrome-profile-fallback-${Date.now()}`), {
      channel: 'chrome', headless: true, viewport: { width: 1100, height: 950 },
      ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'],
    });
    const cdp = await context.browser().newBrowserCDPSession();
    await cdp.send('Extensions.loadUnpacked', { path: extension });
  }
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const config = await worker.evaluate(async () => ({ behavior: await chrome.sidePanel.getPanelBehavior(), permissions: chrome.runtime.getManifest().permissions }));
  assert.equal(config.behavior.openPanelOnActionClick, false); assert.ok(config.permissions.includes('activeTab'));
  const panel = await context.newPage();
  currentPage = panel;
  panel.on('pageerror', error => errors.push(error.message));
  await panel.goto(`chrome-extension://${extensionId}/panel.html`);
  await panel.getByRole('button', { name: '导入简历', exact: true }).click();
  await panel.locator('#pdf-input').setInputFiles(chineseFile);
  await panel.getByRole('button', { name: '保存选中资料' }).waitFor({ timeout: 30000 });
  assert.ok((await panel.locator('[data-import-prop=value]').allTextContents()).some(text => text.includes('同济大学')));
  await panel.getByRole('button', { name: '关闭', exact: true }).click();
  await panel.getByRole('button', { name: '导入简历', exact: true }).click();
  await panel.locator('#pdf-input').setInputFiles(pdfFile);
  await panel.getByRole('button', { name: '保存选中资料' }).waitFor({ timeout: 30000 });
  await panel.getByRole('button', { name: '保存选中资料' }).click();
  await panel.getByText('Alex Chen', { exact: true }).waitFor();
  const stored = await worker.evaluate(async () => (await chrome.storage.local.get('resume-pocket-v1'))['resume-pocket-v1']);
  assert.ok(stored.items.some(i => i.label === '姓名' && i.value === 'Alex Chen'));
  await panel.getByRole('button', { name: '网页填充', exact: true }).click();
  const site = await context.newPage(); await site.goto('http://127.0.0.1:4173/demo/form.html');
  const browserCdp = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await browserCdp.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] });
  const tabTarget = targetInfos.find(t => t.url === site.url());
  await browserCdp.send('Extensions.triggerAction', { id: extensionId, targetId: tabTarget.targetId });
  // Leave the application tab active while operating the companion panel via DOM events.
  await site.bringToFront();
  await panel.locator('[data-action=scan]').evaluate(button => button.click());
  await panel.locator('[data-card]').first().waitFor();
  await panel.locator('#fill-button').evaluate(button => button.click());
  await panel.getByText('已填充 4 项', { exact: true }).waitFor();
  assert.equal(await site.locator('[name=fullName]').inputValue(), 'Alex Chen');
  assert.equal(await site.locator('[name=email]').inputValue(), 'alex@example.com');
  assert.ok((await site.locator('[name=summary]').inputValue()).includes('Frontend engineer'));
  await panel.getByLabel('期望薪资的答案').fill('100K AUD');
  await panel.locator('#fill-button').evaluate(button => button.click());
  await panel.getByText('已填充 1 项', { exact: true }).waitFor();
  const learned = await worker.evaluate(async () => (await chrome.storage.local.get('resume-pocket-v1'))['resume-pocket-v1']);
  assert.ok(learned.items.some(i => i.value === '100K AUD' && i.source === 'memory'));
  await site.reload();
  await panel.locator('[data-action=scan]').evaluate(button => button.click());
  await panel.locator('[data-card]').filter({ has: panel.locator('.field-label', { hasText: '期望薪资' }) }).getByText('已记住', { exact: true }).waitFor();
  await panel.screenshot({ path: path.join(results, 'extension-panel.png'), fullPage: true });
  assert.equal(errors.length, 0, `extension errors: ${errors.join('; ')}`);
  assert.equal(JSON.parse(await readFile(path.join(root, 'dist/manifest.json'), 'utf8')).host_permissions, undefined);
  console.log('PASS: exact production MV3 manifest, toolbar activeTab grant, Chinese/English PDF import with CSP, storage, content script and memory after navigation');
  console.log(`Screenshots: ${results}`);
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: path.join(results, 'failure.png'), fullPage: true });
    console.error('UI status:', await currentPage.locator('#toast').textContent(), await currentPage.locator('#import-status').textContent());
  }
  throw error;
} finally {
  await context?.close(); await browser?.close(); server?.kill();
}
