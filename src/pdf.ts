import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

GlobalWorkerOptions.workerSrc = new URL('pdf.worker.mjs', location.href).href;

export interface TextChunk { str: string; transform: number[]; width: number; height: number; hasEOL: boolean }
export function chunksToText(items: TextChunk[]): string {
  // Preserve PDF reading order, using coordinates to recover line breaks and word spacing.
  const lines: string[] = [];
  let line = '', previous: TextChunk | undefined;
  for (const item of items) {
    if (!item.str && !item.hasEOL) continue;
    if (previous && Math.abs(item.transform[5] - previous.transform[5]) > Math.max(2, Math.min(Math.abs(item.height), Math.abs(previous.height)) * 0.45)) {
      if (line.trim()) lines.push(line.trim());
      line = '';
    }
    const gap = previous ? item.transform[4] - (previous.transform[4] + previous.width) : 0;
    if (line && gap > 1.5 && !/\s$/.test(line) && !/^\s/.test(item.str)) line += ' ';
    line += item.str;
    if (item.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ''; previous = undefined; }
    else previous = item;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join('\n');
}

export async function extractPdf(file: File, progress: (page: number, total: number) => void): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error('PDF 请小于 20 MB');
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('请选择 PDF 文件');
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: new URL('cmaps/', location.href).href, cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', location.href).href,
    useWasm: false,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 30) throw new Error('V1 支持最多 30 页的简历');
    const pages: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      progress(p, pdf.numPages);
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      pages.push(chunksToText(content.items.filter(i => 'str' in i)));
      page.cleanup();
    }
    const text = pages.join('\n\n');
    if (text.replace(/\s/g, '').length < 12) throw new Error('未提取到足够文字。扫描件或图片 PDF 暂不支持 OCR，可切换到“粘贴文本”导入。');
    return text;
  } catch (error) {
    if ((error as Error).name === 'PasswordException') throw new Error('此 PDF 有密码保护，请先解锁后再导入');
    if ((error as Error).name === 'InvalidPDFException') throw new Error('PDF 无效或已损坏，请重新导出');
    throw error;
  } finally { await task.destroy(); }
}
