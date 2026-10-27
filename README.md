# 简历匣 · Resume Pocket

一个本地优先的 Chrome 简历填写插件。当前版本 **0.2.0**，支持教育字段提取、工作与实习分类，以及按项目拆分六类资料。更新详情见 [CHANGELOG](CHANGELOG.md)。

## 使用插件

**直接安装：** 下载 [v0.2.0 插件包](release/resume-pocket-v0.2.0.zip)，解压后，在 Chrome 中加载解压出来的文件夹即可；该文件夹内直接包含 `manifest.json`。校验信息见 [SHA256SUMS.txt](release/SHA256SUMS.txt)。

如果从源码构建，先按下方开发步骤安装依赖并运行 `pnpm build`，再加载生成的 `dist` 文件夹：

1. 使用 **Chrome 140 或更新版本**，打开 `chrome://extensions`，开启右上角的“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择本项目的 **`dist` 文件夹**（不要选择项目根目录或 ZIP 文件）。
3. 将“简历匣”固定到工具栏，点击图标打开侧边栏。
4. 导入 PDF 简历，检查、编辑归类结果，勾选要保存的资料；也可粘贴文本或手动添加。
5. 打开求职表单，在该网页再次点击插件图标，然后点击“识别网页”，检查清单并“一键填充”。已有资料时，也可用“识别并填充已知资料”。
6. 在“待补充”字段输入新答案，保留“记住答案”勾选。成功填充后会保存，下次遇到同一问题可直接复用。也可以“仅保存已勾选的答案，暂不填网页”。

访问另一个网站时，需要再次点击工具栏图标，授予该页面临时访问权限。点击图标会保持侧边栏打开。

插件不会自动点击提交。填写结束后请检查网页；“撤销上次”可恢复最后一批由插件写入且没有被后续修改的字段。

### 从 0.1.0 更新

先导出资料备份，将新 ZIP 解压到原来加载的插件目录并覆盖文件，在 `chrome://extensions` 点击插件的“重新加载”，并刷新正在填写的网页。保持原目录路径，不要卸载插件，以保留本地资料。之后重新导入原始 PDF，检查新的分类结果；旧版已有条目不会自动改写，错误的旧条目请在核对后手动删除。

## 第一版功能

| 流程 | 已实现 |
| --- | --- |
| 导入 | 本地 PDF.js 文字提取；最多 20 MB、30 页；粘贴文本兜底 |
| 归类 | 教育仅提取学校、成绩、专业、学科、学院、学历、课程与就读时间；工作、实习独立分类 |
| 项目 | 每个项目分为项目名称、项目职责、项目时间、项目描述、职责内工作内容、产出或结果；缺失项留空供补充 |
| 审核 | 导入前修改名称、分类、内容；逐项选择保存；完全相同的记录去重 |
| 资料库 | 新增、修改、删除、搜索、分类筛选；自定义字段别名；保留所属学校与项目分组 |
| 识别 | label、ARIA、placeholder、name、autocomplete、分组语境 |
| 填充 | 文本、textarea、普通 contenteditable、原生 select、date、month |
| 记忆 | 标准化问题名称＋教育/工作/项目语境；跨网站复用；删除资料时同步删除关联记忆 |
| 控制 | 默认保留网页已有内容；手动勾选覆盖；校验格式、页面及字段变化；撤销 |
| 数据 | `chrome.storage.local`；JSON 备份、恢复、清空；多窗口写入冲突保护 |

**边界：** PDF 是本地规则归类，无需大模型或 API Key。扫描件 OCR、复杂双栏顺序恢复、自定义下拉/日期组件、Shadow DOM、iframe 内部及多段经历自动拆成重复表格暂不支持。同名重复字段不自动匹配，需逐项选择资料。未知文字会保存在导入草稿的“待整理文本”，便于人工整理。

多个项目拥有同名字段时，在填充清单的资料选择器中按“项目编号 / 项目名称 / 字段”选择。分组资料不会被记成所有项目通用的问答，避免把一个项目的职责填进另一个项目。项目字段的空白草稿默认不勾选，补充文字后会自动勾选保存。

## 体验交互预览

安装 Node.js 24+ 和 pnpm 11+ 后，在项目目录运行：

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

打开 <http://127.0.0.1:4173/panel.html>。左侧是本地测试表单，右侧是插件界面；点击“加载示例资料”即可体验识别、下拉与日期填充、新问题记忆及撤销。预览使用独立的浏览器 localStorage，不与已安装扩展的数据混合。

若希望以扩展测试该网页，可单独打开 <http://127.0.0.1:4173/demo/form.html>，再点击插件图标。

项目六类字段的测试网页为 <http://127.0.0.1:4173/demo/project-form.html>。可用 `tests/fixtures/experience-resume.txt` 中的虚构简历体验分章、分组导入与填充。

## 开发与验证

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

- `dist/` 为可加载、可打包的生产扩展，全量包含 PDF Worker、CMap 和标准字体，无 CDN 依赖。
- `tests/core.test.ts` 验证归类、匹配、格式转换、记忆及页面写入保护。
- `tests/e2e.mjs` 验证浏览器预览与真实 MV3 环境，包括扩展 CSP 下的中英文 PDF 解析、service worker、storage、脚本注入、备份恢复和导航后的答案复用。测试加载原样的生产 manifest，通过 Chrome DevTools Protocol 触发工具栏 action，验证 `activeTab` 临时授权，不添加网站访问权限。测试版 Chrome 无法启动时，自动使用本机 Chrome 的独立测试配置。
- `test-results/` 保存测试 PDF、截图和独立测试浏览器资料；不应当用于真实个人资料。

技术方案、交互与迭代范围见 [V1 设计文档](docs/V1设计.md)。

## 隐私与权限

PDF 不上传；不保存原始 PDF 文件。经确认的文字资料与问答仅在设备本地保存，未加密。卸载扩展会删除扩展内的本地记录，请事先备份。

只申请 `sidePanel`、`storage`、`activeTab`、`scripting` 四项权限；仅在用户调用扩展后读取当前页面，页面脚本不能读取完整资料库。插件只把本次选择的答案传给页面执行脚本，不自动监听你在网站上的输入，也不自动提交。主动填写到网站的内容仍由该网站按其规则处理。

扩展 API 依据 [Chrome Side Panel 文档](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)、[activeTab 文档](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)、[本地存储文档](https://developer.chrome.com/docs/extensions/reference/api/storage)；PDF 提取使用 [Mozilla PDF.js](https://mozilla.github.io/pdf.js/)。
