/**
 * chartLabel.ts — 图表长标签换行公共工具。
 *
 * 集中处理中/英/中英混合、以及无空格连续英文数字字段名的换行，
 * 避免在各图表里重复实现、并避免回归到 overflow:'truncate' 导致的 "..."。
 *
 * 换行以像素化的“显示列数”为预算（CJK 按 1 列、拉丁/数字按约 0.55 列），
 * 因此同一 maxChars 下英文能容纳更多字符，中文按整字断行，混合更自然。
 */

const CJK_RE = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef\u2e80-\u2eff]/;

export function categoryCharWidth(ch: string): number {
  if (!ch) return 0;
  return CJK_RE.test(ch) ? 1 : 0.55;
}

export function categoryStringWidth(value: string): number {
  let w = 0;
  for (const ch of value) w += categoryCharWidth(ch);
  return w;
}

/**
 * 将一个过长的“无空格连续段”（如一段连续英文/数字或一串中文）按预算折行。
 */
function breakSingleToken(token: string, maxChars: number): string[] {
  const lines: string[] = [];
  let cur = '';
  let curW = 0;
  for (const ch of token) {
    const w = categoryCharWidth(ch);
    if (cur && curW + w > maxChars) {
      lines.push(cur);
      cur = '';
      curW = 0;
    }
    cur += ch;
    curW += w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * 按显示列数预算换行字段名。
 * - 空格分隔的英文/词：优先按单词换行；
 * - 无空格连续串（中文、连续英文数字）：按预算折行，绝不截断。
 * 返回以 '\n' 连接的多行字符串；单行时原样返回。
 */
export function wrapCategoryLabel(value: string, maxChars = 15): string {
  if (!value) return value;
  const budget = maxChars > 0 ? maxChars : 15;

  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return value;

  const lines: string[] = [];
  let cur = '';
  let curW = 0;

  const flush = () => {
    if (cur) {
      lines.push(cur);
      cur = '';
      curW = 0;
    }
  };

  for (const token of tokens) {
    const tokenW = categoryStringWidth(token);

    // 单个词就超出预算：先把已有行结算，再折行该词
    if (tokenW > budget) {
      flush();
      const parts = breakSingleToken(token, budget);
      for (let i = 0; i < parts.length; i++) {
        if (i === parts.length - 1) {
          cur = parts[i];
          curW = categoryStringWidth(parts[i]);
        } else {
          lines.push(parts[i]);
        }
      }
      continue;
    }

    const addedSpaceW = cur ? categoryCharWidth(' ') : 0;
    if (cur && curW + addedSpaceW + tokenW > budget) {
      flush();
      cur = token;
      curW = tokenW;
    } else {
      if (cur) {
        cur += ' ';
        curW += addedSpaceW;
      }
      cur += token;
      curW += tokenW;
    }
  }

  flush();
  return lines.join('\n');
}

/** 换行后返回实际行数（>=1）。 */
export function categoryLabelLines(value: string, maxChars = 15): number {
  const wrapped = wrapCategoryLabel(value, maxChars);
  if (!wrapped) return 1;
  return wrapped.split('\n').length;
}

export interface CategoryHeightOptions {
  /** 每行高度 px */
  perLine?: number;
  /** 字段（标签块）之间的额外间距 px */
  lineGap?: number;
  /** 图表最小高度 px */
  base?: number;
  /** 顶部标题等保留高度 px */
  headerReserve?: number;
}

/**
 * 估算一个分类 Y 轴（条形图列名）需要的总体高度。
 * 依据每个标签在当前 maxChars 下的实际换行行数累加，
 * 既不按最窄宽度永久撑高，也不会在标签很短时留大量空白。
 */
export function estimateCategoryAxisHeight(
  labels: readonly string[],
  maxChars = 12,
  options: CategoryHeightOptions = {}
): number {
  const { perLine = 22, lineGap = 14, base = 300, headerReserve = 70 } = options;
  let need = headerReserve;
  for (const label of labels) {
    const lines = categoryLabelLines(label, maxChars);
    need += lines * perLine + lineGap;
  }
  return Math.max(base, need);
}