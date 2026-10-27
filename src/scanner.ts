import { cleanLabel, signatureFor } from './schema';
import { compatibleValue } from './matcher';
import type { FillOutcome, FillRequest, PageField, ScanResult } from './types';

type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
interface Capture { element: Editable; field: PageField }
const excludedTypes = new Set(['hidden', 'password', 'file', 'submit', 'reset', 'button', 'image', 'checkbox', 'radio', 'range', 'color', 'search']);

function visible(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);
  return !element.closest('[hidden],[inert],[aria-hidden="true"]') && style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function text(element: Element | null): string { return element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''; }
function labelText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('input,textarea,select,button,script,style,[role="combobox"]').forEach(n => n.remove());
  return text(clone);
}
function valueOf(element: Editable): string { return 'value' in element ? String(element.value) : element.textContent ?? ''; }

function describe(element: Editable, id: string): PageField {
  const doc = element.ownerDocument;
  const tag = element.tagName.toLowerCase();
  const inputType = element.getAttribute('type')?.toLowerCase() ?? 'text';
  const labelledBy = (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean).map(id => text(doc.getElementById(id))).join(' ');
  const labels = 'labels' in element ? Array.from(element.labels as NodeListOf<HTMLLabelElement> ?? []).map(labelText).join(' ') : '';
  const wrapper = element.closest('[data-field],.form-item,.form-group,.ant-form-item,.el-form-item');
  const nearbyLabel = wrapper?.querySelector('label,.label,.ant-form-item-label,.el-form-item__label');
  const nearby = nearbyLabel ? labelText(nearbyLabel) : '';
  const explicit = labelledBy || element.getAttribute('aria-label') || labels || nearby;
  const fallback = element.getAttribute('placeholder') || element.getAttribute('name') || element.id;
  const label = cleanLabel(explicit || fallback || '未命名字段');
  const fieldset = element.closest('fieldset');
  const section = element.closest('section,[role="group"],[data-section]');
  const context = text(fieldset?.querySelector(':scope > legend') ?? section?.querySelector('h2,h3,h4,[data-heading]') ?? null);
  const isCustom = tag !== 'select' && (element.getAttribute('role') === 'combobox' || element.hasAttribute('aria-haspopup') || element.hasAttribute('aria-autocomplete'));
  const kind = isCustom ? 'unsupported' : tag === 'select' ? 'select' : inputType === 'date' ? 'date' : inputType === 'month' ? 'month' : tag === 'textarea' || element.isContentEditable || element.getAttribute('contenteditable') === 'true' ? 'multiline' : 'text';
  return {
    id, label, context, signature: `${explicit || element.getAttribute('placeholder') ? '' : `${doc.location.origin}|`}${signatureFor(label, context)}`, kind, inputType,
    hints: [element.getAttribute('autocomplete'), element.getAttribute('name'), element.getAttribute('placeholder'), element.id].filter((s): s is string => Boolean(s)),
    currentValue: valueOf(element), required: element.hasAttribute('required') || element.getAttribute('aria-required') === 'true', repeated: false,
    ...(tag === 'select' ? { options: Array.from((element as HTMLSelectElement).options).map(o => ({ value: o.value, label: o.label.trim(), disabled: o.disabled || Boolean(o.closest('optgroup[disabled]')) })) } : {}),
  };
}

export function createScanner(doc: Document) {
  let captures = new Map<string, Capture>();
  let token = '';
  let scanUrl = '';
  let undoValues: { element: Editable; before: string; after: string }[] = [];

  function scan(): ScanResult {
    captures = new Map();
    token = crypto.randomUUID();
    scanUrl = doc.location.href;
    const fields: PageField[] = [];
    let skipped = 0;
    const elements = doc.querySelectorAll<Editable>('input,textarea,select,[contenteditable="true"],[role="combobox"]');
    for (const element of elements) {
      // A custom combobox can wrap a real input. Report it once.
      if (element.getAttribute('role') === 'combobox' && element.querySelector('input,textarea,select')) continue;
      if (!visible(element) || element.matches(':disabled,[readonly],[aria-disabled="true"]') || excludedTypes.has(element.getAttribute('type')?.toLowerCase() ?? 'text') || (element as HTMLSelectElement).multiple) { skipped++; continue; }
      const field = describe(element, crypto.randomUUID());
      if (/验证码|密码|信用卡|银行卡|身份证|passport|credit.?card|card.?number|cvv|captcha|verification.?code|one.?time|password|social.?security/i.test([field.label, ...field.hints].join(' '))) { skipped++; continue; }
      fields.push(field);
      captures.set(field.id, { element, field });
      if (fields.length >= 200) break;
    }
    const counts = new Map<string, number>();
    fields.forEach(f => counts.set(f.signature, (counts.get(f.signature) ?? 0) + 1));
    fields.forEach(f => { f.repeated = (counts.get(f.signature) ?? 0) > 1; });
    return { token, url: scanUrl, title: doc.title, fields, skipped, frames: doc.querySelectorAll('iframe').length };
  }

  async function fill(request: FillRequest): Promise<FillOutcome[]> {
    if (request.token !== token || scanUrl !== doc.location.href) throw new Error('页面已变化，请重新识别后再填充');
    const outcomes: FillOutcome[] = [];
    const changes: typeof undoValues = [];
    for (const entry of request.values) {
      const capture = captures.get(entry.id);
      const fail = (reason: string) => outcomes.push({ id: entry.id, ok: false, reason });
      if (!capture || !capture.element.isConnected || capture.element.ownerDocument !== doc) { fail('字段已被网页替换，请重新识别'); continue; }
      const { element, field } = capture;
      const now = describe(element, entry.id);
      if (!visible(element) || element.matches(':disabled,[readonly],[aria-disabled="true"]') || now.signature !== entry.signature || now.signature !== field.signature || now.kind !== field.kind || now.inputType !== field.inputType) { fail('字段状态已变化，请重新识别'); continue; }
      const before = valueOf(element);
      if (before !== entry.expectedValue) { fail('网页中的内容已变化，已保留新内容'); continue; }
      if (before.trim() && !request.overwrite) { fail('已保留网页原有内容'); continue; }
      if (!entry.value.trim()) { fail('答案为空，已跳过'); continue; }
      const converted = compatibleValue(now, entry.value);
      if (converted.value === undefined) { fail(converted.reason!); continue; }
      if (element instanceof doc.defaultView!.HTMLInputElement || element instanceof doc.defaultView!.HTMLTextAreaElement) {
        const control = element as HTMLInputElement;
        if (control.maxLength > 0 && converted.value.length > control.maxLength) { fail(`超出网页允许的 ${control.maxLength} 字限制`); continue; }
      }
      setValue(element, converted.value);
      // Let synchronous and next-frame framework handlers accept or reject the new value.
      await new Promise(resolve => setTimeout(resolve, 35));
      if (valueOf(element) !== converted.value || !element.isConnected) { fail('网页未接受此值，请检查控件或重新识别'); continue; }
      if ('validity' in element && !(element as HTMLInputElement).validity.valid) {
        setValue(element, before);
        fail('内容不符合网页的格式要求，已恢复原值'); continue;
      }
      changes.push({ element, before, after: converted.value });
      outcomes.push({ id: entry.id, ok: true });
    }
    if (changes.length) undoValues = changes;
    return outcomes;
  }

  function undo(): { restored: number; skipped: number } {
    let restored = 0, skipped = 0;
    for (const { element, before, after } of undoValues) {
      if (element.isConnected && valueOf(element) === after) { setValue(element, before); restored++; }
      else skipped++;
    }
    undoValues = [];
    return { restored, skipped };
  }
  return { scan, fill, undo };
}

function setValue(element: Editable, value: string): void {
  const win = element.ownerDocument.defaultView!;
  const prototype = element.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if ('value' in element && setter) setter.call(element, value);
  else element.textContent = value;
  element.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  element.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
}
