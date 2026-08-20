import { useEffect, useRef } from 'react';
import echarts from '../../utils/insights/echarts';
import type { EChartsType } from 'echarts/core';

/** 挂载 ECharts：init + setOption + ResizeObserver + dispose */
export function useECharts(option: echarts.EChartsCoreOption, deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
