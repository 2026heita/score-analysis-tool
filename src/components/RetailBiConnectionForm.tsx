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
import type { SalesOverviewVO, SalesOverviewComparisonVO } from '../types/retailBi';
import {
  getDefaultRetailBiBaseUrl,
  fetchSalesTrend,
  fetchSalesOverview,
  fetchSalesComparison,
  RetailBiApiError,
} from '../services/retailBiApi';
import { convertSalesDataToParsedTable } from '../services/retailBiAdapter';

/**
 * 组件 Props。
 */
export interface RetailBiConnectionFormProps {
  onDataLoaded: (table: ParsedTable) => void;
  onOverviewLoaded?: (overview: SalesOverviewVO) => void;
  onComparisonLoaded?: (comparison: SalesOverviewComparisonVO) => void;
  onReloadStart?: () => void;
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
 * 旧版 localhost 地址列表（需要清除的默认值）。
 */
const LEGACY_LOCALHOST_URLS = new Set([
  'http://localhost:8080',
  'http://localhost:8080/',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8080/',
]);

/**
 * 读取零售数据 profile 环境变量。
 *
 * 仅用于在连接器区域展示数据来源口径，不影响后端 API 协议。
 * 未配置时返回 null，由 UI 显示为"未声明"。
 */
function getRetailDataProfile(): string | null {
  const profile = import.meta.env.VITE_RETAIL_DATA_PROFILE?.trim();
  return profile && profile.length > 0 ? profile : null;
}

/**
 * 从 localStorage 读取连接配置。
 *
 * 如果保存的地址是旧版 localhost 默认值，则清除该存储键。
 */
function loadStoredConfig(): StoredConnectionConfig | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const config = JSON.parse(stored) as StoredConnectionConfig;

    // 兼容旧配置：清除 localhost 默认值
    if (config.baseUrl && LEGACY_LOCALHOST_URLS.has(config.baseUrl)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return config;
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
 * 零售 BI 连接表单组件。
 */
export function RetailBiConnectionForm({
  onDataLoaded,
  onOverviewLoaded,
  onComparisonLoaded,
  onReloadStart,
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
  }, []);

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

      // 通知父组件
      onDataLoaded(parsedTable);

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
              数据 Profile：{getRetailDataProfile() || '未声明'}
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>API 基础地址</label>
            <input
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
              <label style={styles.label}>开始日期</label>
              <input
                type="date"
                className="retail-bi-input"
                style={styles.input}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="retail-bi-date-group" style={styles.dateGroup}>
              <label style={styles.label}>结束日期</label>
              <input
                type="date"
                className="retail-bi-input"
                style={styles.input}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isLoading}
              />
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
