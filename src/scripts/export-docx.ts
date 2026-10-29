// 把页面正文转成 .docx，样式对应 custom.css 的浅色主题：衬线正文、只有横线的表格、
// 浅底 + 左侧色条的提示框、黑底序号的分步骤。表格列宽和图片尺寸取自页面上的实际排版。
// 由 Export.astro 在点击「导出 Word」时按需加载。

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  ImageRun,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IBorderOptions,
  type IParagraphOptions,
  type IRunOptions,
} from 'docx';

// 与 custom.css 浅色主题一致
const C = {
  text: '1F1F1F',
  strong: '111111',
  gray2: '333333',
  gray3: '6B6B6B',
  gray4: 'A3A3A3',
  line: 'ECECEC',
  panel: 'F7F7F7',
  danger: 'D93025',
  caution: 'E8A317',
};
const FONT = {
  serif: { ascii: 'Georgia', hAnsi: 'Georgia', cs: 'Georgia', eastAsia: '宋体' },
  sans: { ascii: 'Arial', hAnsi: 'Arial', cs: 'Arial', eastAsia: '微软雅黑' },
  mono: { ascii: 'Consolas', hAnsi: 'Consolas', cs: 'Consolas', eastAsia: '宋体' },
};

// A4，页边距与 print.css 相同（单位 twip，1 pt = 20，1 mm ≈ 56.7）
const PAGE = { width: 11906, height: 16838, top: 1020, bottom: 1134, side: 964 };
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.side;
const PX = 15; // 1 px = 15 twip
// 网页正文 17 px，Word 正文 10.5 pt（14 px），表格按同样比例缩小
const SCALE = 14 / 17;
const LIST_INDENT = 420;

const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const line = (color: string, size = 6): IBorderOptions => ({ style: BorderStyle.SINGLE, size, color, space: 0 });

type Block = Paragraph | Table;

interface Fmt {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  font?: keyof typeof FONT;
  size?: number; // 半磅
  color?: string;
  shade?: string;
  sub?: boolean;
  sup?: boolean;
  link?: string;
}

type Token = { kind: 'text'; text: string; fmt: Fmt } | { kind: 'br' } | { kind: 'tab' } | { kind: 'img'; img: HTMLImageElement };

interface Ctx {
  width: number; // 可用宽度（twip）
  indent: number; // 左缩进（twip）
  fmt: Fmt;
  para?: IParagraphOptions; // 段落样式覆盖（表格单元格、提示框标题等）
}

interface Picture {
  data: Uint8Array;
  width: number;
  height: number;
}

const SKIP = '.sl-anchor-link, .sr-only, script, style, template, svg, button, [class^="anno-"], .export-bar';

export async function exportDocx(root: HTMLElement, title: string): Promise<Blob> {
  const pictures = await loadPictures(root);
  const ctx: Ctx = { width: CONTENT_WIDTH, indent: 0, fmt: {} };

  // ---------- 行内 ----------

  function inline(node: Node, fmt: Fmt, out: Token[]) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent!.replace(/\s+/g, ' ');
      if (text) out.push({ kind: 'text', text, fmt });
      return;
    }
    if (!(node instanceof Element) || node.matches(SKIP)) return;
    const f = { ...fmt };
    switch (node.tagName) {
      case 'BR':
        out.push({ kind: 'br' });
        return;
      case 'IMG':
        out.push({ kind: 'img', img: node as HTMLImageElement });
        return;
      case 'INPUT':
        if ((node as HTMLInputElement).type === 'checkbox')
          out.push({ kind: 'text', text: (node as HTMLInputElement).checked ? '☑ ' : '☐ ', fmt: { ...fmt, font: 'sans', color: C.gray3 } });
        return;
      case 'STRONG':
      case 'B':
        f.bold = true;
        f.color ??= C.strong;
        break;
      case 'EM':
      case 'I':
        f.italics = true;
        break;
      case 'DEL':
      case 'S':
        f.strike = true;
        break;
      case 'SUB':
        f.sub = true;
        break;
      case 'SUP':
        f.sup = true;
        break;
      case 'CODE':
      case 'KBD':
        f.font = 'mono';
        f.size = Math.round((fmt.size ?? 21) * 0.9);
        f.shade = C.panel;
        break;
      case 'A': {
        const href = node.getAttribute('href');
        if (href && !href.startsWith('#')) f.link = new URL(href, location.href).href;
        break;
      }
    }
    node.childNodes.forEach((c) => inline(c, f, out));
  }

  function runOptions(text: string, fmt: Fmt): IRunOptions {
    return {
      text,
      bold: fmt.bold,
      italics: fmt.italics,
      strike: fmt.strike,
      font: fmt.font && FONT[fmt.font],
      size: fmt.size,
      color: fmt.link ? C.strong : fmt.color,
      shading: fmt.shade ? { type: ShadingType.CLEAR, fill: fmt.shade, color: 'auto' } : undefined,
      subScript: fmt.sub,
      superScript: fmt.sup,
      underline: fmt.link ? { type: 'single', color: C.gray4 } : undefined,
    };
  }

  function runs(tokens: Token[]) {
    // 去掉首尾空白，合并相邻空格（与浏览器的空白处理一致）
    const ts = tokens.map((t) => ({ ...t }));
    let prevSpace = true;
    for (const t of ts) {
      if (t.kind !== 'text') {
        prevSpace = t.kind !== 'img';
        continue;
      }
      if (prevSpace) t.text = t.text.replace(/^ /, '');
      if (t.text) prevSpace = t.text.endsWith(' ');
    }
    for (let i = ts.length - 1; i >= 0; i--) {
      const t = ts[i];
      if (t.kind === 'text') {
        t.text = t.text.replace(/ $/, '');
        if (t.text) break;
      } else break;
    }

    const out: (TextRun | ImageRun | ExternalHyperlink)[] = [];
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      if (t.kind === 'br') out.push(new TextRun({ break: 1 }));
      else if (t.kind === 'tab') out.push(new TextRun({ children: [new Tab()] }));
      else if (t.kind === 'img') {
        const pic = pictures.get(t.img);
        if (pic)
          out.push(
            new ImageRun({
              type: 'png',
              data: pic.data,
              transformation: { width: pic.width, height: pic.height },
              altText: { name: t.img.alt || 'image', description: t.img.alt, title: t.img.alt },
            }),
          );
        else out.push(new TextRun({ text: `［图片：${t.img.alt}］`, color: C.gray3 }));
      } else if (!t.text) continue;
      else if (t.fmt.link) {
        const link = t.fmt.link;
        const children = [new TextRun(runOptions(t.text, t.fmt))];
        while (ts[i + 1]?.kind === 'text' && (ts[i + 1] as { fmt: Fmt }).fmt.link === link) {
          const n = ts[++i] as { text: string; fmt: Fmt };
          if (n.text) children.push(new TextRun(runOptions(n.text, n.fmt)));
        }
        out.push(new ExternalHyperlink({ link, children }));
      } else out.push(new TextRun(runOptions(t.text, t.fmt)));
    }
    return out;
  }

  const isEmpty = (tokens: Token[]) => tokens.every((t) => t.kind === 'text' && !t.text.trim());

  function paragraph(tokens: Token[], c: Ctx, extra: IParagraphOptions = {}) {
    const onlyImage = tokens.some((t) => t.kind === 'img') && tokens.every((t) => t.kind === 'img' || (t.kind === 'text' && !t.text.trim()));
    return new Paragraph({
      ...c.para,
      ...(onlyImage ? { alignment: AlignmentType.CENTER, spacing: { before: 120, after: 200 } } : {}),
      ...extra,
      indent: { left: c.indent, ...c.para?.indent, ...extra.indent },
      children: runs(tokens),
    });
  }

  // 表格之间、单元格末尾必须有段落，否则 Word 会把相邻表格合并或报错
  const spacer = (after = 0) =>
    new Paragraph({ spacing: { before: 0, after, line: 160, lineRule: LineRuleType.EXACT }, run: { size: 8 }, children: [] });

  // ---------- 块级 ----------

  const isInline = (el: Element) => {
    if (el.matches('img, br, input, code, a, strong, b, em, i, sub, sup, span, kbd, s, del, mark')) return true;
    // Starlight 的标题是 inline（为了把锚点图标放在同一行），按块级处理
    if (el.matches('h1, h2, h3, h4, h5, h6, p, ul, ol, table, pre, aside, details, figure, blockquote, hr')) return false;
    return getComputedStyle(el).display.startsWith('inline');
  };

  function blocks(container: Node, c: Ctx): Block[] {
    const out: Block[] = [];
    let pending: Token[] = [];
    const flush = () => {
      if (!isEmpty(pending)) out.push(paragraph(pending, c));
      pending = [];
    };
    container.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) return inline(node, c.fmt, pending);
      if (!(node instanceof Element) || node.matches(SKIP)) return;
      if (isInline(node)) return inline(node, c.fmt, pending);
      flush();
      out.push(...block(node, c));
    });
    flush();
    return out;
  }

  function block(el: Element, c: Ctx): Block[] {
    if (el.matches('aside.starlight-aside')) {
      const variant = [...el.classList].find((k) => k.startsWith('starlight-aside--'))?.slice(17) ?? 'note';
      const color = variant === 'danger' ? C.danger : variant === 'caution' ? C.caution : C.gray4;
      return box(color, el.querySelector('.starlight-aside__title')?.textContent?.trim(), el.querySelector('.starlight-aside__content'), c);
    }
    if (el.matches('ol.sl-steps')) return steps(el, c);
    if (el.tagName === 'STARLIGHT-TABS') return tabs(el, c);
    if (el.tagName === 'DETAILS') {
      const summary = el.querySelector(':scope > summary');
      const body = document.createElement('div');
      el.childNodes.forEach((n) => n !== summary && body.append(n.cloneNode(true)));
      return box(C.gray4, summary?.textContent?.trim(), body, c);
    }
    if (getComputedStyle(el).display === 'none') return [];

    switch (el.tagName) {
      case 'H1':
      case 'H2':
      case 'H3':
      case 'H4':
      case 'H5':
      case 'H6': {
        const level = Math.min(Number(el.tagName[1]), 4);
        const tokens: Token[] = [];
        inline(el, {}, tokens);
        return [paragraph(tokens, c, { style: `Heading${level}` })];
      }
      case 'P': {
        const tokens: Token[] = [];
        inline(el, c.fmt, tokens);
        return isEmpty(tokens) ? [] : [paragraph(tokens, c)];
      }
      case 'UL':
      case 'OL':
        return list(el, c, 0);
      case 'TABLE':
        return [table(el as HTMLTableElement, c), spacer(160)];
      case 'PRE':
        return code(el, c);
      case 'BLOCKQUOTE':
        return box(C.gray4, undefined, el, c);
      case 'HR':
        return [new Paragraph({ border: { bottom: line(C.line) }, spacing: { after: 240 }, children: [] })];
      case 'FIGCAPTION': {
        const tokens: Token[] = [];
        inline(el, { font: 'sans', size: 18, color: C.gray3 }, tokens);
        return [paragraph(tokens, c, { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 240 } })];
      }
      case 'FIGURE':
        return blocks(el, { ...c, para: { ...c.para, alignment: AlignmentType.CENTER, spacing: { before: 200, after: 80 } } });
      default:
        return blocks(el, c);
    }
  }

  function list(el: Element, c: Ctx, level: number): Block[] {
    const ordered = el.tagName === 'OL';
    const task = el.classList.contains('contains-task-list');
    let n = Number(el.getAttribute('start') ?? 1);
    const bullets = ['•', '◦', '▪'];
    const left = c.indent + LIST_INDENT * (task ? level : level + 1);
    const inner: Ctx = { ...c, indent: left, width: c.width - (left - c.indent) };
    const out: Block[] = [];

    for (const li of el.children) {
      if (li.tagName !== 'LI') continue;
      const marker = task ? null : ordered ? `${n++}.` : bullets[level % bullets.length];
      let first = true;
      let pending: Token[] = [];
      const flush = () => {
        if (isEmpty(pending) && !first) return;
        // 序号后接制表符，对齐到悬挂缩进位置
        const tokens: Token[] = first && marker ? [{ kind: 'text', text: marker, fmt: c.fmt }, { kind: 'tab' }, ...pending] : pending;
        out.push(paragraph(tokens, inner, { spacing: { after: 80 }, indent: first && marker ? { hanging: LIST_INDENT } : {} }));
        first = false;
        pending = [];
      };
      li.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) return inline(node, c.fmt, pending);
        if (!(node instanceof Element) || node.matches(SKIP)) return;
        if (isInline(node)) return inline(node, c.fmt, pending);
        if (node.tagName === 'P') {
          const p: Token[] = [];
          inline(node, c.fmt, p);
          if (!first) flush();
          pending.push(...p);
          flush();
          return;
        }
        flush();
        if (node.tagName === 'UL' || node.tagName === 'OL') out.push(...list(node, { ...c }, level + 1));
        else out.push(...block(node, inner));
      });
      if (first || !isEmpty(pending)) flush();
    }
    return out;
  }

  function cellWidths(row: Element, total: number) {
    const cells = [...row.children] as HTMLElement[];
    const px = cells.map((c) => c.getBoundingClientRect().width);
    const sum = px.reduce((a, b) => a + b, 0);
    if (!sum) return cells.map(() => Math.floor(total / cells.length));
    const width = Math.min(total, sum * PX * SCALE);
    return px.map((w) => Math.floor((w / sum) * width));
  }

  function table(el: HTMLTableElement, c: Ctx): Table {
    const rows = [...el.rows];
    const widths = cellWidths(rows[0], c.width);
    return new Table({
      layout: TableLayoutType.FIXED,
      width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
      columnWidths: widths,
      indent: { size: c.indent, type: WidthType.DXA },
      borders: NO_BORDERS,
      rows: rows.map((tr) => {
        const head = [...tr.cells].every((cell) => cell.tagName === 'TH');
        let col = 0;
        return new TableRow({
          tableHeader: head,
          cantSplit: true,
          children: [...tr.cells].map((cell) => {
            const span = cell.colSpan || 1;
            const w = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
            col += span;
            const align = getComputedStyle(cell).textAlign;
            const fmt: Fmt = cell.tagName === 'TH' ? { font: 'sans', size: 17, bold: true, color: C.gray3 } : { size: 20 };
            const content = blocks(cell, {
              width: w - 320,
              indent: 0,
              fmt,
              para: {
                spacing: { before: 0, after: 0, line: 300, lineRule: LineRuleType.AUTO },
                alignment: align === 'right' || align === 'end' ? AlignmentType.RIGHT : align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
              },
            });
            return new TableCell({
              width: { size: w, type: WidthType.DXA },
              columnSpan: span > 1 ? span : undefined,
              verticalAlign: cell.tagName === 'TH' ? VerticalAlign.BOTTOM : VerticalAlign.TOP,
              margins: { top: 110, bottom: 110, left: 40, right: 280 },
              borders: { top: NONE, left: NONE, right: NONE, bottom: cell.tagName === 'TH' ? line(C.strong) : line(C.line) },
              children: content.length ? fixCell(content) : [new Paragraph({ children: [] })],
            });
          }),
        });
      }),
    });
  }

  const fixCell = (content: Block[]) => (content.at(-1) instanceof Table ? [...content, spacer()] : content);

  // 浅底 + 左侧细色条（提示框、折叠问答、引用）
  function box(color: string, title: string | undefined, content: Node | null, c: Ctx): Block[] {
    const inner: Ctx = { width: c.width - 520, indent: 0, fmt: c.fmt, para: { spacing: { before: 0, after: 100 } } };
    const children: Block[] = [];
    if (title)
      children.push(
        new Paragraph({
          spacing: { before: 0, after: 80 },
          keepNext: true,
          children: [new TextRun({ text: title, font: FONT.sans, size: 18, bold: true, color: C.strong })],
        }),
      );
    if (content) children.push(...blocks(content, inner));
    return [
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: c.width, type: WidthType.DXA },
        columnWidths: [c.width],
        indent: { size: c.indent, type: WidthType.DXA },
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: c.width, type: WidthType.DXA },
                shading: { type: ShadingType.CLEAR, fill: C.panel, color: 'auto' },
                margins: { top: 180, bottom: 80, left: 260, right: 260 },
                borders: { top: NONE, bottom: NONE, right: NONE, left: line(color, 18) },
                children: children.length ? fixCell(children) : [new Paragraph({ children: [] })],
              }),
            ],
          }),
        ],
      }),
      spacer(200),
    ];
  }

  // 分步骤：黑底白字序号 + 内容
  function steps(el: Element, c: Ctx): Block[] {
    const numWidth = 620;
    const bodyWidth = c.width - numWidth;
    const items = [...el.children].filter((li) => li.tagName === 'LI');
    return [
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: c.width, type: WidthType.DXA },
        columnWidths: [numWidth, bodyWidth],
        indent: { size: c.indent, type: WidthType.DXA },
        borders: NO_BORDERS,
        rows: items.map(
          (li, i) =>
            new TableRow({
              children: [
                new TableCell({
                  width: { size: numWidth, type: WidthType.DXA },
                  margins: { top: 40, bottom: 0, left: 0, right: 220 },
                  borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 0, after: 0, line: 300, lineRule: LineRuleType.AUTO },
                      shading: { type: ShadingType.CLEAR, fill: C.strong, color: 'auto' },
                      children: [new TextRun({ text: String(i + 1), font: FONT.sans, size: 18, bold: true, color: 'FFFFFF' })],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: bodyWidth, type: WidthType.DXA },
                  margins: { top: 0, bottom: 160, left: 0, right: 0 },
                  borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
                  children: fixCell(blocks(li, { width: bodyWidth, indent: 0, fmt: c.fmt })),
                }),
              ],
            }),
        ),
      }),
      spacer(160),
    ];
  }

  // 标签页：逐个展开为「标签名 + 内容」
  function tabs(el: Element, c: Ctx): Block[] {
    const labels = [...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim() ?? '');
    const out: Block[] = [];
    el.querySelectorAll(':scope > [role="tabpanel"]').forEach((panel, i) => {
      out.push(
        new Paragraph({
          indent: { left: c.indent },
          spacing: { before: 120, after: 80 },
          keepNext: true,
          border: { bottom: line(C.line) },
          children: [new TextRun({ text: labels[i] ?? '', font: FONT.sans, size: 18, bold: true, color: C.strong })],
        }),
        ...blocks(panel, c),
      );
    });
    return out;
  }

  function code(el: Element, c: Ctx): Block[] {
    const lines = (el.textContent ?? '').replace(/\n$/, '').split('\n');
    return lines.map(
      (text, i) =>
        new Paragraph({
          indent: { left: c.indent + 160, right: 160 },
          shading: { type: ShadingType.CLEAR, fill: C.panel, color: 'auto' },
          spacing: { before: 0, after: i === lines.length - 1 ? 200 : 0, line: 260, lineRule: LineRuleType.AUTO },
          children: [new TextRun({ text: text || ' ', font: FONT.mono, size: 17 })],
        }),
    );
  }

  // ---------- 组装 ----------

  const body: Block[] = [];
  const banner = document.querySelector('.preview-banner');
  if (banner) {
    const note = document.createElement('p');
    note.textContent = banner.querySelector('span')?.textContent ?? '';
    body.push(...box(C.caution, banner.querySelector('strong')?.textContent ?? undefined, note, ctx));
  }
  body.push(new Paragraph({ style: 'Title', children: [new TextRun(title)] }));
  body.push(...blocks(root, ctx));
  const date = new Intl.DateTimeFormat('sv-SE').format(new Date());
  body.push(
    new Paragraph({
      spacing: { before: 480, after: 0 },
      border: { top: { ...line(C.line), space: 6 } },
      children: [new TextRun({ text: `导出自 ${location.href} · ${date}`, font: FONT.sans, size: 16, color: C.gray4 })],
    }),
  );

  const heading = (size: number, before: number, after: number, extra: Partial<IParagraphOptions> = {}) => ({
    run: { font: FONT.serif, size, bold: true, color: C.strong },
    paragraph: { spacing: { before, after, line: 312, lineRule: LineRuleType.AUTO }, keepNext: true, keepLines: true, ...extra },
  });

  const doc = new Document({
    title,
    creator: '实验室 SOP 手册',
    styles: {
      default: {
        document: {
          run: { font: FONT.serif, size: 21, color: C.text },
          paragraph: { spacing: { before: 0, after: 160, line: 408, lineRule: LineRuleType.AUTO } },
        },
        title: heading(44, 0, 320),
        heading1: heading(30, 560, 160, { outlineLevel: 0 }),
        heading2: heading(30, 560, 160, { outlineLevel: 1, border: { top: { ...line(C.line), space: 14 } } }),
        heading3: heading(25, 360, 120, { outlineLevel: 2 }),
        heading4: heading(22, 240, 80, { outlineLevel: 3 }),
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.side, right: PAGE.side, header: 567, footer: 567 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT.sans, size: 16, color: C.gray3 })],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return Packer.toBlob(doc);
}

// ---------- 图片：统一转成 PNG（Word 不支持 SVG/WebP），按页面显示尺寸嵌入 ----------

async function loadPictures(root: HTMLElement) {
  const map = new Map<HTMLImageElement, Picture>();
  const maxWidth = CONTENT_WIDTH / PX;
  for (const img of root.querySelectorAll('img')) {
    try {
      const blob = await (await fetch(img.currentSrc || img.src)).blob();
      const url = URL.createObjectURL(blob);
      try {
        const el = new Image();
        el.src = url;
        await el.decode();
        const natW = el.naturalWidth || Number(img.getAttribute('width')) || maxWidth;
        const natH = el.naturalHeight || Number(img.getAttribute('height')) || natW;
        const shown = img.getBoundingClientRect().width || Number(img.getAttribute('width')) || natW;
        const width = Math.round(Math.min(shown, maxWidth));
        const height = Math.round((width * natH) / natW);
        // 矢量图按 3 倍、位图按原始分辨率绘制
        const scale = blob.type.includes('svg') ? 3 : Math.max(1, natW / width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        canvas.getContext('2d')!.drawImage(el, 0, 0, canvas.width, canvas.height);
        const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject()), 'image/png'));
        map.set(img, { data: new Uint8Array(await png.arrayBuffer()), width, height });
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.warn('导出 Word：图片处理失败', img.src, err);
    }
  }
  return map;
}
