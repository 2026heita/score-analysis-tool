/**
 * 零售 BI 连接表单组件。
 *
 * 职责：
 * 1. 提供 API 连接配置输入界面；
 * 2. 调用零售 BI API 获取数据；
 * 3. 将数据转换为 ParsedTable 格式；
 * 4. 通过回调通知父组件数据已就绪。
 *
 * 不负责：
 * - 直接操作 App 状态（setParsedData 等）；
 * - 字段类型推断；
 * - 分析流程控制。
 */

import { useState, useEffect } from 'react';
import type { ParsedTable } from '../types';
import {
  getDefaultRetailBiBaseUrl,
  fetchSalesTrend,
  RetailBiApiError,
} from '../services/retailBiApi';
import { convertSalesDataToParsedTable } from '../services/retailBiAdapter';

/**
 * 组件 Props。
 */
export interface RetailBiConnectionFormProps {
  onDataLoaded: (table: ParsedTable) => void;
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
 * 从 localStorage 读取连接配置。
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
 * 零售 BI 连接表单组件。
 */
export function RetailBiConnectionForm({
  onDataLoaded,
}: RetailBiConnectionFormProps) {
  // 初始化表单状态
  const [baseUrl, setBaseUrl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 组件挂载时读取 localStorage
  useEffect(() => {
    const stored = loadStoredConfig();
    if (stored) {
      setBaseUrl(stored.baseUrl || getDefaultRetailBiBaseUrl());
      setStartDate(stored.startDate || '');
      setEndDate(stored.endDate || '');
    } else {
      setBaseUrl(getDefaultRetailBiBaseUrl());
    }
  }, []);

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

    // 开始加载
    setIsLoading(true);

    try {
      // 调用 API
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
    <div style={styles.container}>
      <div style={styles.formGroup}>
        <label style={styles.label}>API 基础地址</label>
        <input
          type="text"
          style={styles.input}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:8080"
          disabled={isLoading}
        />
      </div>

      <div style={styles.dateRow}>
        <div style={styles.dateGroup}>
          <label style={styles.label}>开始日期</label>
          <input
            type="date"
            style={styles.input}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div style={styles.dateGroup}>
          <label style={styles.label}>结束日期</label>
          <input
            type="date"
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
  );
}

/**
 * 组件样式（与现有 UI 风格保持一致）。
 */
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  dateRow: {
    display: 'flex',
    gap: '16px',
  },
  dateGroup: {
    flex: 1,
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
