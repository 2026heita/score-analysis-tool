import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { safeFormatNumber } from '../../utils/safeFormat';
import EChartsWrapper from './EChartsWrapper';

export interface TimeSeriesLineChartProps {
  dates: string[];
  values: Array<number | null>;
  fieldName: string;
  dateFieldName: string;
  duplicateCount?: number;
}

// 日期标签格式化：缩短显示但保留原始数据
const formatDateLabel = (dateStr: string): string => {
  // 匹配 YYYY-MM-DD 或 YYYY-M-D 或 YYYY/MM/DD 或 YYYY/M/D，可选时间部分
  const dateMatch = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/);
  if (dateMatch) {
    const [, , month, day, hour, minute] = dateMatch;
    // 如果有时间部分，显示 MM-DD HH:mm
    if (hour !== undefined) {
      return `${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute}`;
    }
    // 否则显示 MM-DD
    return `${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  // 无法识别的格式，保持原始
  return dateStr;
};

// 旋转策略：根据数据点数量
const getRotation = (count: number): number => {
  if (count <= 8) return 0;
  if (count <= 15) return 30;
  return 45;
};

export default function TimeSeriesLineChart({
  dates,
  values,
  fieldName,
  dateFieldName,
  duplicateCount,
}: TimeSeriesLineChartProps) {
  const hasData = dates.length > 0 && values.length > 0;
  const lengthMismatch = hasData && dates.length !== values.length;

  const option: EChartsOption = useMemo(() => {
    // 空数据
    if (!hasData) {
      return {
        title: {
          text: '【' + fieldName + '】时间趋势',
          subtext: `时间字段：${dateFieldName}`,
          left: 'center',
          textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
          subtextStyle: { fontSize: 11, color: '#94a3b8' },
        },
        graphic: {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: {
            text: '暂无可视化数据',
            fill: '#94a3b8',
            fontSize: 14,
          },
        },
      } as EChartsOption;
    }

    // 长度不一致 → 显示错误提示
    if (lengthMismatch) {
      return {
        title: {
          text: '【' + fieldName + '】时间趋势',
          subtext: `时间字段：${dateFieldName}`,
          left: 'center',
          textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
          subtextStyle: { fontSize: 11, color: '#94a3b8' },
        },
        graphic: {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: {
            text: '数据异常：时间轴与数值轴长度不一致',
            fill: '#ef4444',
            fontSize: 14,
          },
        },
      } as EChartsOption;
    }

    // 数据点较少时显示 symbol，较多时隐藏
    const showSymbol = dates.length <= 20;
    const rotation = getRotation(dates.length);

    return {
      title: {
        text: '【' + fieldName + '】时间趋势',
        subtext: `时间字段：${dateFieldName}`,
        left: 'center',
        textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
        subtextStyle: { fontSize: 11, color: '#94a3b8' },
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          if (!p) return '';
          const dateLabel = p.axisValue ?? '';
          const val = p.value;
          if (val === null || val === undefined || val === '-') {
            return `${dateLabel}<br/>${fieldName}：暂无数据`;
          }
          return `${dateLabel}<br/>${fieldName}：${safeFormatNumber(val)}`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: rotation > 0 ? '15%' : '10%', top: '18%', containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLabel: {
          interval: 'auto',
          rotate: rotation,
          fontSize: 10,
          hideOverlap: true,
          formatter: formatDateLabel,
        },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
      },
      series: [
        {
          name: fieldName,
          type: 'line',
          data: values,
          connectNulls: false,
          showSymbol: showSymbol,
          lineStyle: { color: '#3b82f6', width: 2 },
          itemStyle: { color: '#3b82f6' },
        },
      ],
    } as EChartsOption;
  }, [dates, values, fieldName, dateFieldName, hasData, lengthMismatch]);

  if (lengthMismatch) {
    return (
      <div style={styles.container}>
        <div style={styles.errorBox}>
          数据异常：时间轴（{dates.length} 项）与数值轴（{values.length} 项）长度不一致，请检查数据源。
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div style={styles.container}>
        <EChartsWrapper option={option} chartTypes={['line']} style={styles.chartStyle} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <EChartsWrapper option={option} chartTypes={['line']} style={styles.chartStyle} />
      {duplicateCount != null && duplicateCount > 0 && (
        <div style={styles.hint}>
          检测到 {duplicateCount} 个重复时间点，当前按原始记录展示，未进行自动聚合。
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
  },
  chartStyle: {
    height: '350px',
    width: '100%',
  },
  hint: {
    marginTop: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    color: '#d97706',
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '6px',
    lineHeight: 1.5,
  },
  errorBox: {
    padding: '24px',
    textAlign: 'center' as const,
    fontSize: '14px',
    color: '#ef4444',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
  },
};
