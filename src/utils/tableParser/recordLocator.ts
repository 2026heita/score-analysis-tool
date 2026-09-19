// ============================================================
// 记录定位字段识别引擎（离线 / 纯本地 / 无外部 AI 依赖）
// ============================================================
//
// 背景：
//   旧实现依赖 columnsName.includes('学号') 之类的精确子串匹配，
//   当用户把字段改名（学生编号/名字）、表头含说明文字、或编号字段
//   命名不详时，会误报"当前数据未包含可用于记录定位的字段"。
//
// 设计：
//   1. 字段分析：对每个字段输出 语义 + 置信度 + 唯一性 + 样例值；
//   2. 语义匹配层：字段名别名 + 数据模式 + 唯一性三者联合打分，
//      避免仅靠字段名；
//   3. 组合定位：允许 姓名+班级 等多字段组合，不强制存在单列唯一 ID；
//   4. 模糊探索：对用户输入做 去空格/忽略大小写/全半角/常见符号清洗，
//      再匹配各文本列。
//
// 领域边界：
//   本文件是"记录定位"专用层，仅使用通用业务概念（学号/编号/ID、
//   姓名、班级/部门/地区 等），不承担字段 schema 推断职责，也不引入
//   教育领域的成绩/排名语义。

// 语义类别：某字段可能承担哪种"定位角色"
export type LocatorSemantic = 'identifier' | 'name' | 'group' | 'time' | 'other';

// 单字段数据外观模式（用于辅助打分，不承载业务含义）
export type LocatorValueType =
  | 'code'          // 长数字/字母编号串
  | 'chineseName'   // 2~4 个中文字符
  | 'date'          // 日期样式
  | 'lowCardinality'// 低基数类别（班级/部门等）
  | 'mixed'
  | 'empty';

// 单字段分析结果
export interface LocatorFieldAnalysis {
  /** 原始字段名（表头） */
  fieldName: string;
  /** 标准化编号，例如 student_id / name / class */
  normalizedName: string;
  /** 定位角色 */
  semantic: LocatorSemantic;
  /** 置信度 0~1 */
  confidence: number;
  /** 示例值（最多 3 个去重非空值） */
  sampleValues: string[];
  /** 总行数 */
  totalRows: number;
  /** 非空值数量 */
  nonEmpty: number;
  /** 去重值数量 */
  uniqueCount: number;
  /** 唯一性 0~1（去重值 / 非空值） */
  uniqueness: number;
  /** 数据外观模式 */
  valueType: LocatorValueType;
  /** 命中的别名原文（若有） */
  matchedAlias?: string;
  /** 是否为可参与定位的候选字段 */
  isCandidate: boolean;
  /** 定位能力描述（用于诊断文案） */
  ability: string;
}

// 匹配某一查询时某字段的命中情况（用于候选展示与诊断）
export interface LocatorMatchStats {
  fieldName: string;
  semantic: LocatorSemantic;
  confidence: number;
  uniqueness: number;
  /** 命中的行数 */
  matchedCount: number;
  sampleValues: string[];
  isUniqueField: boolean;
  ability: string;
}

// 字段分析 + 查询诊断报告
export interface LocatorReport {
  /** 扫描字段数量 */
  scannedFields: number;
  /** 可靠唯一字段（可直接定位，若无为 null） */
  uniqueField: string | null;
  /** 候选定位字段（含命中统计） */
  candidates: LocatorMatchStats[];
  /** 姓名/组合建议 */
  suggestion: string;
}

// ============================================================
// 别名表
// ============================================================

interface AliasDef {
  /** 标准化编号 */
  token: string;
  /** 命中该别名的关键词（字段名） */
  words: string[];
  /** 是否弱别名（权重低，如"序号/编码"，需数据佐证） */
  weak?: boolean;
}

// 标识字段别名：覆盖用户常见命名
const IDENTIFIER_ALIASES: AliasDef[] = [
  { token: 'student_id', words: ['学号', '学生编号', '学生学号', '学籍编号', '学籍号', '考生号', '准考证号', '准考证', '考号'] },
  { token: 'employee_id', words: ['工号', '员工编号', '员工工号', '职员编号'] },
  { token: 'order_id', words: ['订单号', '订单编号', '单号'] },
  { token: 'account_id', words: ['账号', '账户', '编号id', 'id'] },
  { token: 'code', words: ['编号', '编码', '代码', '标识', '序号', '身份证号', '身份证'], weak: true },
];

// 姓名字段别名
const NAME_ALIASES: AliasDef[] = [
  { token: 'name', words: ['姓名', '名字', '学生姓名', '姓名』'] },
  { token: 'name_en', words: ['name', 'student name', 'full name'] },
  { token: 'label_name', words: ['名称'], weak: true },
];

// 分组字段别名（用于组合定位消歧）
const GROUP_ALIASES: AliasDef[] = [
  { token: 'class', words: ['班级', '行政班', '教学班', '班号', 'class'] },
  { token: 'department', words: ['部门', '单位', '科室', '院系', '专业', 'department'] },
  { token: 'region', words: ['地区', '城市', '市县', '省份', '所在地', '区域', 'region', 'city'] },
  { token: 'class_group', words: ['组别', '分组', '小组', '组号', 'group'], weak: true },
];

// 时间字段别名
const TIME_ALIASES: AliasDef[] = [
  { token: 'time', words: ['日期', '时间', 'date', 'time', 'day'] },
];

// ============================================================
// 文本规范化（全角→半角 / 小写 / 去空格 / 去常见符号）
// ============================================================

/** 全角字符换算为半角 */
function toHalfWidth(input: string): string {
  return input
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ');
}

/** 宽松清洗：小写 + 去首尾空白 + 规整内部空白 */
function loose(value: string): string {
  return toHalfWidth(value).toLowerCase().trim().replace(/\s+/g, ' ');
}

/** 紧凑清洗：在宽松基础上进一步去除全部空白与常见符号 */
function compact(value: string): string {
  return loose(value).replace(/[\s_\-./:：,，。·;；]+/g, '');
}

/** 仅保留数字（用于日期/编号的等值比较） */
function digitsOnly(value: string): string {
  return toHalfWidth(value).replace(/\D+/g, '');
}

/** 字符串相似度（Levenshtein 编辑距离的相似率 0~1），用于候选排序 */
function similarityRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

// ============================================================
// 字段外观模式识别
// ============================================================

function detectValueType(values: string[]): LocatorValueType {
  const nonEmpty = values.filter(v => v.trim() !== '');
  const total = nonEmpty.length;
  if (total === 0) return 'empty';

  let chineseName = 0;
  let code = 0;
  let date = 0;
  const uniq = new Set(nonEmpty.map(v => v.trim()));

  for (const v of nonEmpty) {
    const t = v.trim();
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(t)) chineseName++;
    // 日期：2026-01-01 / 2026/01/01 / 2026-1-1
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(t) || /^\d{8}$/.test(t)) date++;
    // 编号/代码：字母+数字，长度 3~30，不含中文
    if (/^[0-9A-Za-z][0-9A-Za-z._\-]{2,29}$/.test(t)) code++;
  }

  if (chineseName / total >= 0.5) return 'chineseName';
  if (date / total >= 0.5) return 'date';
  if (code / total >= 0.5) return 'code';
  if (uniq.size / total <= 0.15) return 'lowCardinality';
  return 'mixed';
}

// ============================================================
// 字段名别名命中
// ============================================================

interface AliasHit {
  token: string;
  semantic: LocatorSemantic;
  weak: boolean;
  word: string;
}

function matchAlias(header: string): AliasHit | null {
  const h = compact(header);
  if (!h) return null;

  const check = (aliases: AliasDef[], semantic: LocatorSemantic): AliasHit | null => {
    for (const def of aliases) {
      for (const word of def.words) {
        const w = compact(word);
        if (!w) continue;
        if (h === w || h.includes(w) || w.includes(h) && w.length > 1) {
          return { token: def.token, semantic, weak: !!def.weak, word };
        }
      }
    }
    return null;
  };

  // 优先级：标识 > 姓名 > 分组 > 时间
  return check(IDENTIFIER_ALIASES, 'identifier')
    || check(NAME_ALIASES, 'name')
    || check(GROUP_ALIASES, 'group')
    || check(TIME_ALIASES, 'time');
}

// ============================================================
// 单字段置信度打分
// ============================================================

function scoreField(header: string, values: string[]): {
  semantic: LocatorSemantic;
  normalizedName: string;
  confidence: number;
  valueType: LocatorValueType;
  matchedAlias?: string;
  ability: string;
} {
  const nonEmpty = values.filter(v => v.trim() !== '');
  const total = nonEmpty.length;
  const valueType = detectValueType(values);
  const aliasHit = matchAlias(header);
  const uniqueness = total > 0 ? new Set(nonEmpty.map(v => v.trim())).size / total : 0;

  // 默认语义
  let semantic: LocatorSemantic = 'other';
  let confidence = 0.2;
  let normalizedName = compact(header) || 'unlabeled';
  let ability = '未识别为定位字段';

  // ---- 标识字段 ----
  if (aliasHit?.semantic === 'identifier') {
    semantic = 'identifier';
    const base = aliasHit.weak ? 0.72 : 0.9;
    confidence = base;
    // 唯一性高 → 提升；序号类（弱 + 连续递增）需数据佐证
    if (uniqueness >= 0.9) confidence += 0.04;
    if (valueType === 'code') confidence += 0.02;
    if (uniqueness < 0.5 && aliasHit.weak) confidence -= 0.15;
    normalizedName = aliasHit.token;
    ability = `名称含"${aliasHit.word}"${uniqueness >= 0.9 ? '，唯一性高' : '，存在重复'}`;
  }
  // ---- 姓名字段 ----
  else if (aliasHit?.semantic === 'name') {
    semantic = 'name';
    const base = aliasHit.weak ? 0.7 : 0.88;
    confidence = base;
    if (valueType === 'chineseName') confidence += 0.04;
    if (uniqueness >= 0.9) confidence += 0.03;
    // 姓名天然可重复，不因重复过重降分
    if (uniqueness < 0.2) confidence -= 0.08;
    normalizedName = aliasHit.token;
    ability = `名称含"${aliasHit.word}"${uniqueness < 0.95 ? `，存在 ${total - new Set(nonEmpty.map(v => v.trim())).size} 条重复` : ''}`;
  }
  // ---- 分组字段 ----
  else if (aliasHit?.semantic === 'group') {
    semantic = 'group';
    const base = aliasHit.weak ? 0.66 : 0.84;
    confidence = base;
    if (valueType === 'lowCardinality') confidence += 0.04;
    normalizedName = aliasHit.token;
    ability = `名称含"${aliasHit.word}"，低基数分组`;
  }
  // ---- 时间字段 ----
  else if (aliasHit?.semantic === 'time') {
    semantic = 'time';
    confidence = valueType === 'date' ? 0.85 : 0.7;
    normalizedName = aliasHit.token;
    ability = `名称含"${aliasHit.word}"`;
  }
  // ---- 内容推断（无明确别名时）----
  else if (valueType === 'code' && uniqueness >= 0.9 && total >= 3) {
    semantic = 'identifier';
    confidence = 0.78;
    ability = '内容为编号串且唯一性高';
  } else if (valueType === 'chineseName' && uniqueness >= 0.6) {
    semantic = 'name';
    confidence = 0.7;
    ability = '内容特征像姓名';
  } else if (valueType === 'date') {
    semantic = 'time';
    confidence = 0.8;
    ability = '内容为日期';
  }

  confidence = Math.max(0, Math.min(0.99, Math.round(confidence * 100) / 100));
  return { semantic, normalizedName, confidence, valueType, matchedAlias: aliasHit?.word, ability };
}

// ============================================================
// 主入口：字段分析
// ============================================================

export function analyzeLocatorFields(
  headers: string[],
  rows: Record<string, string>[],
): LocatorFieldAnalysis[] {
  return headers.map(fieldName => {
    const values = rows.map(r => r[fieldName] ?? '');
    const nonEmpty = values.filter(v => v.trim() !== '');
    const uniqueCount = new Set(nonEmpty.map(v => v.trim())).size;
    const totalRows = rows.length;
    const uniqueness = totalRows > 0 ? uniqueCount / totalRows : 0;

    const { semantic, normalizedName, confidence, valueType, ability } = scoreField(fieldName, values);

    const sampleValues = Array.from(new Set(nonEmpty.map(v => v.trim()))).slice(0, 3);

    // 是否为可参与定位的候选字段
    const isCandidate =
      (semantic === 'identifier' && confidence >= 0.6) ||
      (semantic === 'name' && confidence >= 0.68) ||
      (semantic === 'group' && confidence >= 0.6) ||
      (semantic === 'time' && confidence >= 0.72);

    return {
      fieldName,
      normalizedName,
      semantic,
      confidence,
      sampleValues,
      totalRows,
      nonEmpty: nonEmpty.length,
      uniqueCount,
      uniqueness: Math.round(uniqueness * 100) / 100,
      valueType,
      matchedAlias: matchAlias(fieldName)?.word,
      isCandidate,
      ability,
    };
  });
}

// ============================================================
// 匹配
// ============================================================

/**
 * 在指定字段列中查找匹配查询值的行。
 * 采用逐步放松的规范化比较（原始/去空格/紧凑清洗），
 * 自动支持 全半角、大小写、空白、常见符号差异。
 * @param fieldName 字段名
 * @param query     用户输入
 * @param rows      数据行
 * @param opts      allowClean=是否允许紧凑清洗（编号类建议 false，避免误合并）
 */
export function matchRowsByField(
  fieldName: string,
  query: string,
  rows: Record<string, string>[],
  opts: { allowClean?: boolean; semantic?: LocatorSemantic } = {},
): Record<string, string>[] {
  if (!query) return [];
  const qLoose = loose(query);
  const qCompact = compact(query);
  const qDigit = digitsOnly(query);
  const dataType = opts.semantic;

  return rows.filter(row => {
    const raw = (row[fieldName] || '').trim();
    if (raw === '') return false;

    // 日期类：比较数字形态（2026-01-01 === 20260101）
    if (dataType === 'time' || (dataType === 'identifier' && /^\d+$/.test(qDigit) && qDigit.length >= 6)) {
      if (digitsOnly(raw) === qDigit) return true;
    }
    const rawLoose = loose(raw);
    if (rawLoose === qLoose) return true;
    if (compact(raw) === qCompact) return true;
    if (opts.allowClean && rawLoose.replace(/\s+/g, '') === qLoose.replace(/\s+/g, '')) return true;
    return false;
  });
}

/**
 * 组合定位：多字段同时满足（如 姓名 + 班级）。
 * @param combos [{ field, value }]
 */
export function matchRowsByCombo(
  combos: { field: string; value: string }[],
  rows: Record<string, string>[],
  analysis: LocatorFieldAnalysis[],
): Record<string, string>[] {
  const active = combos.filter(c => c.value.trim() !== '');
  if (active.length === 0) return rows;

  const semanticOf = (field: string): LocatorSemantic | undefined =>
    analysis.find(a => a.fieldName === field)?.semantic;

  return rows.filter(row =>
    active.every(c => {
      const raw = (row[c.field] || '').trim();
      if (raw === '') return false;
      return matchRowsByField(c.field, c.value, [row], { semantic: semanticOf(c.field) }).length > 0;
    }),
  );
}

// ============================================================
// 查询诊断报告
// ============================================================

/**
 * 对一次查找生成结构化诊断：
 * - scannedFields / uniqueField / candidates（含命中数） / suggestion
 */
export function buildLocatorReport(
  analysis: LocatorFieldAnalysis[],
  query: string,
  rows: Record<string, string>[],
): LocatorReport {
  const candidates = analysis
    .filter(a => a.isCandidate)
    .map(a => {
      const matched = query.trim() !== ''
        ? matchRowsByField(a.fieldName, query, rows, { semantic: a.semantic })
        : [];
      return {
        fieldName: a.fieldName,
        semantic: a.semantic,
        confidence: a.confidence,
        uniqueness: a.uniqueness,
        matchedCount: matched.length,
        sampleValues: a.sampleValues,
        isUniqueField: a.uniqueness >= 0.95,
        ability: a.ability,
      } as LocatorMatchStats;
    })
    .sort((x, y) => y.confidence - x.confidence);

  const uniqueField = analysis.find(
    a => a.semantic === 'identifier' && a.isCandidate && a.uniqueness >= 0.95,
  )?.fieldName ?? null;

  const nameCandidate = candidates.find(c => c.semantic === 'name');
  const groupCandidate = candidates.find(c => c.semantic === 'group');

  let suggestion = '未检测到可用的唯一定位字段。';
  if (nameCandidate && groupCandidate) {
    suggestion = '建议输入 姓名 + 班级/部门 进行组合定位。';
  } else if (nameCandidate) {
    suggestion = '存在姓名，但可能有重复；建议补充一个分组字段用于组合定位。';
  } else {
    suggestion = '未识别出明显的标识/姓名/分组字段，请检查表头或数据。';
  }

  return { scannedFields: analysis.length, uniqueField, candidates, suggestion };
}

// 供调试面板显示相似方法的导出（当前实现基于编辑距离，供候选排序保留复用）
export function _similarityRatio(a: string, b: string): number {
  return similarityRatio(a, b);
}

// 导出规范化工具（供调试/输入处理复用）
export const lookupNormalizers = { loose, compact, digitsOnly, toHalfWidth };