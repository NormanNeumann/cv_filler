export const categories = ['基本信息', '个人简介', '教育经历', '工作经历', '项目经历', '技能证书', '其他资料', '问答记忆'] as const;
export type Category = typeof categories[number];
export interface ProfileItem {
  id: string;
  label: string;
  value: string;
  category: Category;
  aliases: string[];
  source: 'manual' | 'pdf' | 'memory';
  updatedAt: string;
}
export interface Memory {
  signature: string;
  itemId: string;
}
export interface Store {
  version: 1;
  items: ProfileItem[];
  memories: Memory[];
  updatedAt: string;
}
export type FieldKind = 'text' | 'multiline' | 'select' | 'date' | 'month' | 'unsupported';
export interface PageField {
  id: string;
  label: string;
  hints: string[];
  context: string;
  signature: string;
  kind: FieldKind;
  inputType: string;
  currentValue: string;
  required: boolean;
  options?: { value: string; label: string; disabled: boolean }[];
  repeated: boolean;
}
export interface ScanResult {
  token: string;
  url: string;
  title: string;
  fields: PageField[];
  skipped: number;
  frames: number;
}
export interface FillRequest {
  token: string;
  values: { id: string; value: string; signature: string; expectedValue: string }[];
  overwrite: boolean;
}
export interface FillOutcome { id: string; ok: boolean; reason?: string }
export interface Match { itemId: string; confidence: 'exact' | 'memory' | 'suggested'; reason: string }
export interface FieldDraft {
  field: PageField;
  itemId: string;
  value: string;
  selected: boolean;
  remember: boolean;
  match?: Match;
  outcome?: FillOutcome;
}
