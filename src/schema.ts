import type { Category } from './types';

export const normalize = (s: string): string => s.normalize('NFKC').toLowerCase()
  .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[\s\p{P}\p{S}]/gu, '');

export const contextKey = (context: string): string => {
  if (/教育|学历|education|academic/i.test(context)) return 'education';
  if (/项目|project/i.test(context)) return 'project';
  if (/工作|职业|实习|employment|work|experience/i.test(context)) return 'work';
  return '';
};
export const signatureFor = (label: string, context: string): string => `${contextKey(context)}|${normalize(label)}`;

export interface Definition { label: string; category: Category; aliases: string[]; multiline?: boolean }
export const definitions: Definition[] = [
  { label: '姓名', category: '基本信息', aliases: ['姓名', '中文姓名', '真实姓名', 'full name', 'fullname', 'your name', 'name', 'name surname', 'given-name family-name'] },
  { label: '英文名', category: '基本信息', aliases: ['英文名', '英文姓名', 'english name', 'preferred name'] },
  { label: '名', category: '基本信息', aliases: ['名', '名字', 'first name', 'given name', 'given-name', 'firstName'] },
  { label: '姓', category: '基本信息', aliases: ['姓', '姓氏', 'last name', 'family name', 'family-name', 'surname', 'lastName'] },
  { label: '电子邮箱', category: '基本信息', aliases: ['邮箱', '电子邮箱', '电子邮件', '联系邮箱', 'email', 'e-mail', 'email address', 'contact email'] },
  { label: '手机号码', category: '基本信息', aliases: ['手机', '手机号码', '手机号', '电话', '联系电话', '联系方式', 'phone', 'phone number', 'mobile', 'mobile number', 'tel'] },
  { label: '所在城市', category: '基本信息', aliases: ['所在城市', '现居城市', '现居地', '居住城市', 'city', 'current city', 'location'] },
  { label: '联系地址', category: '基本信息', aliases: ['地址', '联系地址', '通讯地址', '居住地址', 'address', 'street-address', 'mailing address'] },
  { label: '个人网站', category: '基本信息', aliases: ['个人网站', '作品集链接', '个人主页', 'website', 'portfolio', 'personal website', 'url'] },
  { label: 'LinkedIn', category: '基本信息', aliases: ['linkedin', 'linkedin profile', 'linkedin url'] },
  { label: 'GitHub', category: '基本信息', aliases: ['github', 'github url', 'github profile'] },
  { label: '出生日期', category: '基本信息', aliases: ['出生日期', '生日', 'date of birth', 'birth date', 'birthday', 'bday'] },
  { label: '个人简介', category: '个人简介', aliases: ['个人简介', '自我介绍', '自我评价', '个人总结', 'summary', 'professional summary', 'about me', 'bio', 'introduction'], multiline: true },
  { label: '教育经历', category: '教育经历', aliases: ['教育经历', '教育背景', 'education', 'education history', 'academic background'], multiline: true },
  { label: '毕业院校', category: '教育经历', aliases: ['毕业院校', '学校', '院校', '学校名称', 'university', 'school', 'institution', 'college'] },
  { label: '专业', category: '教育经历', aliases: ['专业', '所学专业', '专业名称', 'major', 'field of study'] },
  { label: '最高学历', category: '教育经历', aliases: ['学历', '最高学历', '学位', 'degree', 'highest degree', 'education level'] },
  { label: '工作经历', category: '工作经历', aliases: ['工作经历', '实习经历', '职业经历', 'work experience', 'employment history', 'work history', 'professional experience'], multiline: true },
  { label: '公司名称', category: '工作经历', aliases: ['公司', '公司名称', '工作单位', 'company', 'company name', 'employer'] },
  { label: '职位名称', category: '工作经历', aliases: ['职位', '职位名称', '岗位', '职务', 'job title', 'position', 'role'] },
  { label: '项目经历', category: '项目经历', aliases: ['项目经历', '项目经验', 'projects', 'project experience', 'project description'], multiline: true },
  { label: '专业技能', category: '技能证书', aliases: ['技能', '专业技能', '技术栈', 'skills', 'technical skills', 'tech stack'], multiline: true },
  { label: '证书奖项', category: '技能证书', aliases: ['证书奖项', '荣誉奖项', '资格证书', 'certifications', 'certificates', 'awards'], multiline: true },
];

export function definitionFor(label: string): Definition | undefined {
  const key = normalize(label);
  return definitions.find(d => d.aliases.some(a => normalize(a) === key) || normalize(d.label) === key);
}

export function cleanLabel(text: string): string {
  return text.normalize('NFKC').replace(/\s*\((?:必填|选填|required|optional)\)\s*/gi, '').replace(/^[\s*•·]+|[\s*：:]+$/g, '').trim().slice(0, 160);
}
