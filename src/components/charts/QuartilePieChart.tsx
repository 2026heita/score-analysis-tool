import type { EChartsOption } from 'echarts';
import { buildQuartilePieData, formatNumber } from '../../utils/chartData';
import EChartsWrapper from './EChartsWrapper';

interface QuartilePieChartProps {
  values: number[];
  fieldName: string;
  userValue?: number;
}

// 颜色语义：低分橙红 → 黄 → 蓝 → 高分绿
const COLORS = ['#f97316', '#fbbf24', '#60a5fa', '#34d399'];

export default function QuartilePieChart({ values, fieldName, userValue }: QuartilePieChartProps) {
  const pieData = buildQuartilePieData(values);

  const chartOption: EChartsOption | null = (() => {
    if (!pieData || pieData.segments.length === 0) return null;

    const isSingle = pieData.isAllSame;
    const data = pieData.segments.map((seg, i) => ({
      name: seg.name,
      value: seg.value,
      percentage: seg.percentage,
      rangeText: seg.rangeText,
      itemStyle: { color: isSingle ? '#60a5fa' : COLORS[i] },
    }));

    return {
      title: {
        text: `【${fieldName}】四分位占比图`,
        left: 'center',
        textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const d = params.data;
          if (pieData.isAllSame) {
            return `${d.name}<br/>人数：${d.value}<br/>占比：100%<br/>数值：${d.rangeText}`;
          }
          return `${d.name}<br/>人数：${d.value}<br/>占比：${d.percentage.toFixed(1)}%<br/>范围：${d.rangeText}`;
        },
      },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '55%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: {
            formatter: '{b}\n{d}%',
            fontSize: 12,
          },
          labelLine: { length: 15, length2: 20 },
          data,
        },
      ],
    } as EChartsOption;
  })();

  // 用户数值区间提示（含阈值）
  let userHintText = '';
  if (pieData && Number.isFinite(userValue as number)) {
    if (pieData.isAllSame) {
      userHintText = '当前字段所有有效值相同，无法划分四分位区间。';
    } else {
      const v = userValue!;
      const q1Str = formatNumber(pieData.q1);
      const medStr = formatNumber(pieData.median);
      const q3Str = formatNumber(pieData.q3);
      if (v < pieData.q1) {
        userHintText = `你的数值 ${formatNumber(v)} 位于：低于 Q1 区间（Q1 = ${q1Str}）。`;
      } else if (v < pieData.median) {
        userHintText = `你的数值 ${formatNumber(v)} 位于：Q1 至中位数区间（Q1 = ${q1Str}，中位数 = ${medStr}）。`;
      } else if (v < pieData.q3) {
        userHintText = `你的数值 ${formatNumber(v)} 位于：中位数至 Q3 区间（中位数 = ${medStr}，Q3 = ${q3Str}）。`;
      } else {
        userHintText = `你的数值 ${formatNumber(v)} 位于：Q3 及以上区间（Q3 = ${q3Str}）。`;
      }
    }
  }

  return (
    <div>
      {chartOption ? (
        <>
          <EChartsWrapper option={chartOption} chartTypes={['pie']} style={{ height: '360px', width: '100%' }} />
          {userHintText && (
            <p style={styles.userHint}>{userHintText}</p>
          )}
          <p style={styles.note}>
            四分位占比图按 Q1、中位数、Q3 将数据划分为四个区间，用于观察当前字段的数据集中情况。由于同分和边界归类，各区间人数不一定刚好等于 25%。该图不代表排名名次。
          </p>
        </>
      ) : (
        <div style={styles.emptyHint}>暂无可视化数据</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  userHint: {
    textAlign: 'center',
    padding: '8px 12px',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#1e40af',
    marginTop: '8px',
  },
  note: {
    textAlign: 'center',
    fontSize: '11px',
    color: '#94a3b8',
    marginTop: '10px',
  },
  emptyHint: {
    textAlign: 'center',
    padding: '20px',
    color: '#94a3b8',
    fontSize: '13px',
  },
};
