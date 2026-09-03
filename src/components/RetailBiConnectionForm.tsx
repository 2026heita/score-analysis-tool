/**
 * 零售 BI 连接表单组件。
 *
 * 职责：
 * 1. 提供外部数据源接入入口（折叠式）；
 * 2. 调用零售 BI API 获取数据；
 * 3. 将数据转换为 ParsedTable 格式；
 * 4. 通过回调通知父组件数据已就绪。
 *
 * 不负责：
 * - 直接操作 App 状态（setParsedData 等）；
 * - 字段类型推断；
 * - 分析流程控制。
 */

import { useState, useEffect, useRef } from 'react';
import type { ParsedTable } from '../types';
import type { RetailBiConnectionConfig, SalesAnomalyVO, SalesOverviewVO, SalesOverviewComparisonVO } from '../types/retailBi';
import HelpPopover from './help/HelpPopover';
import { getHelp } from '../data/helpContent';
import {
  getDefaultRetailBiBaseUrl,
  fetchSalesTrend,
  fetchSalesOverview,
  fetchSalesComparison,
  fetchSalesAnomalies,
  RetailBiApiError,
} from '../services/retailBiApi';
import { convertSalesDataToParsedTable } from '../services/retailBiAdapter';

/**
 * 组件 Props。
 */
export interface RetailBiConnectionFormProps {
  /**
   * 外部数据加载成功回调。
   * @param table    转换后的 ParsedTable（进入主分析链路）
   * @param config   当前查询所用的小型配置（baseUrl / startDate / endDate），
   *                 用于告诉主应用当前数据来源，并作为恢复查询条件的元数据。
   */
  onDataLoaded: (table: ParsedTable, config: RetailBiConnectionConfig) => void;
  onOverviewLoaded?: (overview: SalesOverviewVO) => void;
  onComparisonLoaded?: (comparison: SalesOverviewComparisonVO) => void;
  onAnomaliesLoaded?: (anomalies: SalesAnomalyVO[]) => void;
  onReloadStart?: () => void;
  /** 父组件触发“清空所有数据”时的自增信号；值变化时同步清空本组件连接配置并删除独立存储 */
  clearSignal?: number;
}

/**
 * localStorage 存储的连接配置。
 */
interface StoredConnectionConfig {
  baseUrl: string;
  startDate: string;
  endDate: string;
}

/**
 * localStorage 键名。
 */
const STORAGE_KEY = 'game-score.retail-bi.connection';

/**
 * 允许的 profile 值白名单。
 */
const ALLOWED_PROFILES = new Set([
  'canonical',
  'engineering_legacy_3x',
  'synthetic_multiday',
]);

/**
 * 读取并验证零售数据 profile 环境变量。
 *
 * 仅用于在连接器区域展示数据来源口径，不影响后端 API 协议。
 * 返回验证后的 profile 值或错误状态。
 */
function getRetailDataProfile(): { value: string | null; isValid: boolean } {
  const profile = import.meta.env.VITE_RETAIL_DATA_PROFILE?.trim();

  if (!profile || profile.length === 0) {
    return { value: null, isValid: true };
  }

  if (!ALLOWED_PROFILES.has(profile)) {
    return { value: profile, isValid: false };
  }

  return { value: profile, isValid: true };
}

/**
 * 从 localStorage 读取连接配置。
 *
 * 直接返回已保存的用户配置；不再在加载时清除 localhost 等旧默认值，
 * 确保用户手动配置的 baseUrl（含本地 localhost 联调地址）能在刷新后正确恢复。
 */
function loadStoredConfig(): StoredConnectionConfig | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as StoredConnectionConfig;
  } catch {
    return null;
  }
}

/**
 * 保存连接配置到 localStorage。
 */
function saveStoredConfig(config: StoredConnectionConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 忽略存储失败
  }
}

/**
 * 将 yyyy-MM-dd 格式的日期字符串加减指定天数。
 * 使用本地年月日构造 Date，避免时区导致日期偏移。
 */
function adjustDateByDays(dateStr: string, delta: number): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + delta);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 零售 BI 连接表单组件。
 */
export function RetailBiConnectionForm({
  onDataLoaded,
  onOverviewLoaded,
  onComparisonLoaded,
  onAnomaliesLoaded,
  onReloadStart,
  clearSignal,
}: RetailBiConnectionFormProps) {
  // 初始化表单状态
  const [baseUrl, setBaseUrl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 折叠状态：默认收起
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // 标记 localStorage hydration 是否完成，避免首次 mount 用空字符串覆盖已有配置
  const [isHydrated, setIsHydrated] = useState(false);

  // 组件挂载时读取 localStorage
  useEffect(() => {
    const stored = loadStoredConfig();
    if (stored) {
      setBaseUrl(stored.baseUrl || '');
      setStartDate(stored.startDate || '');
      setEndDate(stored.endDate || '');
    } else {
      // 仅使用显式环境变量，不自动填入 localhost
      setBaseUrl(getDefaultRetailBiBaseUrl());
    }
    // 延迟标记 hydration 完成，确保本次 state 更新不会触发自动保存
    const timer = setTimeout(() => setIsHydrated(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // hydration 完成后，用户修改任意字段时自动持久化
  useEffect(() => {
    if (!isHydrated) return;

    const trimmedBaseUrl = baseUrl.trim();
    const trimmedStartDate = startDate.trim();
    const trimmedEndDate = endDate.trim();

    // 三个字段全部为空时删除存储键
    if (!trimmedBaseUrl && !trimmedStartDate && !trimmedEndDate) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // 忽略
      }
      return;
    }

    saveStoredConfig({
      baseUrl: trimmedBaseUrl,
      startDate: trimmedStartDate,
      endDate: trimmedEndDate,
    });
  }, [isHydrated, baseUrl, startDate, endDate]);

  // 父组件“清空所有数据”信号：值变化时立即同步清空连接配置（并删除独立存储），
  // 避免仅清空主 state 后本组件仍显示旧值
  const prevClearSignal = useRef(clearSignal ?? 0);
  useEffect(() => {
    if (clearSignal === undefined) return;
    if (clearSignal === prevClearSignal.current) return;
    prevClearSignal.current = clearSignal;

    setBaseUrl('');
    setStartDate('');
    setEndDate('');
    setError(null);
    setSuccessMessage(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 忽略存储失败
    }
  }, [clearSignal]);

  // 同步 details 元素的 open 属性与 React 状态
  useEffect(() => {
    if (detailsRef.current) {
      detailsRef.current.open = isExpanded;
    }
  }, [isExpanded]);

  /**
   * 处理 details 元素的 toggle 事件。
   */
  function handleToggle() {
    if (detailsRef.current) {
      setIsExpanded(detailsRef.current.open);
    }
  }

  /**
   * 前端表单校验。
   */
  function validateForm(): string | null {
    if (!baseUrl.trim()) {
      return '请输入 API 基础地址';
    }
    if (!startDate.trim()) {
      return '请选择开始日期';
    }
    if (!endDate.trim()) {
      return '请选择结束日期';
    }
    if (startDate > endDate) {
      return '开始日期不能晚于结束日期';
    }
    return null;
  }

  /**
   * 处理加载数据。
   */
  async function handleLoadData() {
    // 清空之前的消息
    setError(null);
    setSuccessMessage(null);

    // 前端校验
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    // 通知父组件清理旧的概览和环比数据
    onReloadStart?.();

    // 开始加载
    setIsLoading(true);

    try {
      // 调用 API 获取趋势数据
      const data = await fetchSalesTrend({
        baseUrl: baseUrl.trim(),
        startDate: startDate.trim(),
        endDate: endDate.trim(),
      });

      // 转换为 ParsedTable
      const parsedTable = convertSalesDataToParsedTable(data);

      // 保存配置到 localStorage
      saveStoredConfig({
        baseUrl: baseUrl.trim(),
        startDate: startDate.trim(),
        endDate: endDate.trim(),
      });

      // 通知父组件：ParsedTable + 当前查询配置（来源元数据）
      onDataLoaded(
        parsedTable,
        {
          baseUrl: baseUrl.trim(),
          startDate: startDate.trim(),
          endDate: endDate.trim(),
        }
      );

      // 如果提供了概览回调，加载单日概览数据
      if (onOverviewLoaded) {
        try {
          const overview = await fetchSalesOverview(
            baseUrl.trim(),
            endDate.trim()
          );
          onOverviewLoaded(overview);
        } catch (overviewError) {
          // 概览数据加载失败不影响趋势数据
          console.warn('加载单日概览数据失败:', overviewError);
        }
      }

      // 如果提供了环比回调，加载日环比数据
      if (onComparisonLoaded) {
        try {
          const comparison = await fetchSalesComparison(
            baseUrl.trim(),
            endDate.trim()
          );
          onComparisonLoaded(comparison);
        } catch (comparisonError) {
          // 环比数据加载失败不影响趋势数据
          console.warn('加载日环比数据失败:', comparisonError);
        }
      }

      // 如果提供了经营异常回调，加载同一日期范围内的异常数据
      if (onAnomaliesLoaded) {
        try {
          const anomalies = await fetchSalesAnomalies({
            baseUrl: baseUrl.trim(),
            startDate: startDate.trim(),
            endDate: endDate.trim(),
          });
          onAnomaliesLoaded(anomalies);
        } catch (anomalyError) {
          // 异常模块加载失败不影响趋势、概览与环比数据
          console.warn('加载经营异常数据失败:', anomalyError);
        }
      }

      // 显示成功消息
      setSuccessMessage(`成功加载 ${data.length} 行数据`);
    } catch (err) {
      // 处理错误
      if (err instanceof RetailBiApiError) {
        let errorMessage = err.message;
        if (err.requestId) {
          errorMessage += ` (Request ID: ${err.requestId})`;
        }
        setError(errorMessage);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('加载数据时发生未知错误');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={styles.wrapper}>
      <details
        ref={detailsRef}
        style={styles.details}
        onToggle={handleToggle}
      >
        <summary style={styles.summary}>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLeft}>
              <span
                style={{
                  ...styles.arrow,
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                }}
              >
                &#9654;
              </span>
              <span style={styles.title}>外部数据源</span>
              <span style={styles.optionalBadge}>可选</span>
              <HelpPopover content={getHelp('external')} />
            </div>
            <span style={styles.subtitle}>
              连接已配置的业务分析服务并加载结构化数据
            </span>
          </div>
        </summary>

        <div style={styles.expandedContent}>
          <div style={styles.connectorLabel}>
            当前支持：零售经营指标接口
            <div style={styles.connectorHint}>
              用于连接项目配套的零售 BI 服务，暂不支持任意 API 数据格式。
            </div>
            <div style={styles.profileInfo}>
              {(() => {
                const profile = getRetailDataProfile();
                if (profile.value === null) {
                  return '前端声明的数据Profile：未声明';
                }
                if (!profile.isValid) {
                  return '前端声明的数据Profile：配置无效';
                }
                return `前端声明的数据Profile：${profile.value}`;
              })()}
              <div style={styles.profileHint}>
                该值来自前端环境配置，实际口径以后端数据血缘说明为准。
              </div>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="retail-bi-base-url">API 基础地址</label>
            <input
              id="retail-bi-base-url"
              name="retail-bi-base-url"
              type="text"
              className="retail-bi-input"
              style={styles.input}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
              disabled={isLoading}
            />
          </div>

          <div className="retail-bi-date-row" style={styles.dateRow}>
            <div className="retail-bi-date-group" style={styles.dateGroup}>
              <span style={styles.dateRangeLabelWrap}>
                <label style={styles.label} htmlFor="retail-bi-start-date">开始日期</label>
                <HelpPopover content={getHelp('retail_date_range')} />
              </span>
              <div style={styles.dateInputGroup}>
                <button
                  type="button"
                  style={styles.dateAdjustButton}
                  onClick={() => setStartDate(adjustDateByDays(startDate, -7))}
                  disabled={!startDate || isLoading}
                  aria-label="开始日期减 7 天"
                >
                  -7天
                </button>
                <button
                  type="button"
                  style={styles.dateAdjustButton}
                  onClick={() => setStartDate(adjustDateByDays(startDate, -1))}
                  disabled={!startDate || isLoading}
                  aria-label="开始日期减 1 天"
                >
                  -1天
                </button>
                <input
                  id="retail-bi-start-date"
                  name="retail-bi-start-date"
                  type="date"
                  className="retail-bi-input"
                  style={styles.dateInput}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  style={styles.dateAdjustButton}
                  onClick={() => setStartDate(adjustDateByDays(startDate, 1))}
                  disabled={!startDate || isLoading}
                  aria-label="开始日期加 1 天"
                >
                  +1天
                </button>
                <button
                  type="button"
                  style={styles.dateAdjustButton}
                  onClick={() => setStartDate(adjustDateByDays(startDate, 7))}
                  disabled={!startDate || isLoading}
                  aria-label="开始日期加 7 天"
                >
                  +7天
                </button>
              </div>
            </div>

            <div className="retail-bi-date-group" style={styles.dateGroup}>
              <label style={styles.label} htmlFor="retail-bi-end-date">结束日期</label>
              <div style={styles.dateInputGroup}>
                <button
                  type="button"
                  style={styles.dateAdjustButton}
                  onClick={() => setEndDate(adjustDateByDays(endDate, -7))}
                  disabled={!endDate || isLoading}
                  aria-label="结束日期减 7 天"
                >
                  -7天
                </button>
                <button
                  type="button"
                  style={styles.dateAdjustButton}
                  onClick={() => setEndDate(adjustDateByDays(endDate, -1))}
                  disabled={!endDate || isLoading}
                  aria-label="结束日期减 1 天"
                >
                  -1天
                </button>
                <input
                  id="retail-bi-end-date"
                  name="retail-bi-end-date"
                  type="date"
                  className="retail-bi-input"
                  style={styles.dateInput}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  style={styles.dateAdjustButton}
                  onClick={() => setEndDate(adjustDateByDays(endDate, 1))}
                  disabled={!endDate || isLoading}
                  aria-label="结束日期加 1 天"
                >
                  +1天
                </button>
                <button
                  type="button"
                  style={styles.dateAdjustButton}
                  onClick={() => setEndDate(adjustDateByDays(endDate, 7))}
                  disabled={!endDate || isLoading}
                  aria-label="结束日期加 7 天"
                >
                  +7天
                </button>
              </div>
            </div>
          </div>

          <button
            style={{
              ...styles.button,
              ...(isLoading ? styles.buttonDisabled : {}),
            }}
            onClick={handleLoadData}
            disabled={isLoading}
          >
            {isLoading ? '加载中……' : '加载数据'}
          </button>

          <p style={styles.autoSaveHint}>
            连接配置会自动保存在当前浏览器。可使用快捷按钮调整日期，也可直接打开日历选择。
          </p>

          {error && <p style={styles.error}>{error}</p>}
          {successMessage && <p style={styles.success}>{successMessage}</p>}
        </div>
      </details>
    </div>
  );
}

/**
 * 组件样式。
 */
const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    marginTop: '16px',
  },
  details: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    cursor: 'pointer',
    userSelect: 'none',
    background: '#f8fafc',
    borderBottom: '1px solid transparent',
    listStyle: 'none',
    outline: 'none',
  },
  summaryContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    width: '100%',
  },
  summaryLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  arrow: {
    fontSize: '10px',
    color: '#94a3b8',
    transition: 'transform 0.15s ease',
    display: 'inline-block',
    width: '14px',
    textAlign: 'center',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#334155',
  },
  optionalBadge: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#94a3b8',
    background: '#f1f5f9',
    padding: '1px 6px',
    borderRadius: '4px',
    border: '1px solid #e2e8f0',
  },
  subtitle: {
    fontSize: '12px',
    color: '#64748b',
    paddingLeft: '22px',
  },
  expandedContent: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    borderTop: '1px solid #e2e8f0',
  },
  connectorLabel: {
    fontSize: '12px',
    color: '#64748b',
    padding: '6px 10px',
    background: '#f8fafc',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  },
  connectorHint: {
    fontSize: '11px',
    color: '#94a3b8',
    marginTop: '4px',
  },
  profileInfo: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '4px',
    fontStyle: 'italic',
  },
  profileHint: {
    fontSize: '10px',
    color: '#94a3b8',
    marginTop: '2px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  dateRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '16px',
    width: '100%',
  },
  dateGroup: {
    minWidth: 0,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  dateInputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  dateRangeLabelWrap: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#475569',
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.15s',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    display: 'block',
  },
  dateInput: {
    flex: 1,
    minWidth: 0,
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  dateAdjustButton: {
    padding: '6px 8px',
    fontSize: '11px',
    fontWeight: 500,
    color: '#475569',
    background: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  button: {
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
    transition: 'all 0.15s',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  autoSaveHint: {
    margin: 0,
    fontSize: '11px',
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  error: {
    margin: 0,
    color: '#ef4444',
    fontSize: '14px',
    padding: '8px 12px',
    background: '#fef2f2',
    borderRadius: '6px',
    borderLeft: '3px solid #ef4444',
  },
  success: {
    margin: 0,
    color: '#16a34a',
    fontSize: '14px',
    padding: '8px 12px',
    background: '#f0fdf4',
    borderRadius: '6px',
    borderLeft: '3px solid #16a34a',
  },
};
