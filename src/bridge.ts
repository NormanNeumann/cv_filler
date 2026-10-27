import { createScanner } from './scanner';
import { inExtension } from './storage';
import type { FillOutcome, FillRequest, ScanResult } from './types';

let previewScanner: ReturnType<typeof createScanner> | undefined;
let targetTabId: number | undefined;
let targetDocumentId: string | undefined;

function preview() {
  const frame = document.querySelector<HTMLIFrameElement>('#demo-frame');
  if (!frame?.contentDocument?.querySelector('form')) throw new Error('示例网页尚未准备好，请稍后再试');
  previewScanner ??= createScanner(frame.contentDocument);
  return previewScanner;
}

async function message<T>(type: string, request?: FillRequest): Promise<T> {
  if (targetTabId === undefined) throw new Error('请先识别当前网页');
  const response = await chrome.tabs.sendMessage(targetTabId, { type, request }, { frameId: 0, ...(targetDocumentId ? { documentId: targetDocumentId } : {}) });
  if (!response?.ok) throw new Error(response?.error ?? '网页未响应，请重新识别');
  return response.result;
}

export async function scanPage(): Promise<ScanResult> {
  if (!inExtension()) return preview().scan();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('没有可读取的当前网页');
  targetTabId = tab.id;
  targetDocumentId = undefined;
  try {
    const injections = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ['content.js'] });
    targetDocumentId = injections[0]?.documentId;
    return await message<ScanResult>('RP_SCAN');
  } catch (error) {
    const reason = (error as Error).message;
    if (/cannot access|missing host|permission|extensions gallery|chrome:\/\//i.test(reason)) throw new Error('请在普通网页中点击工具栏的简历匣图标授权，再点识别。Chrome 内部页面和商店页面无法填写。');
    throw error;
  }
}

export async function fillPage(request: FillRequest): Promise<FillOutcome[]> {
  if (!inExtension()) return preview().fill(request);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== targetTabId) throw new Error('你已切换标签页，请先识别当前网页');
  return message<FillOutcome[]>('RP_FILL', request);
}

export async function undoPage(): Promise<{ restored: number; skipped: number }> {
  if (!inExtension()) return preview().undo();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== targetTabId) throw new Error('请回到刚才填充的标签页再撤销');
  return message('RP_UNDO');
}
