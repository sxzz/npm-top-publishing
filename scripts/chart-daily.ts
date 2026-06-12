import { createCanvas, SvgExportFlag, type SvgCanvas } from '@napi-rs/canvas'
import Chart from 'chart.js/auto'
import stats from '../daily-stats.json' with { type: 'json' }
import {
  COLORS,
  COMBO_SERIES,
  getListUpdateIndices,
  getNullableMetricSeries,
  INDEPENDENT_SERIES,
  registerInterFont,
  writeChartSvg,
  type DailyStat,
  type MetricSeriesSpec,
} from './shared.ts'

registerInterFont()

const data = stats as DailyStat[]

const updateIndices = getListUpdateIndices(data)

const pointRadius = (ctx: any) => (updateIndices.has(ctx.dataIndex) ? 6 : 0)
const pointStyle = (ctx: any) =>
  updateIndices.has(ctx.dataIndex) ? 'triangle' : 'circle'

const verticalLinePlugin = {
  id: 'listUpdateMarker',
  afterDatasetsDraw(chart: any) {
    const { ctx, chartArea, scales } = chart
    ctx.save()
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)'
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1
    for (const i of updateIndices) {
      const x = scales.x.getPixelForValue(i)
      ctx.beginPath()
      ctx.moveTo(x, chartArea.top)
      ctx.lineTo(x, chartArea.bottom)
      ctx.stroke()
    }
    ctx.restore()
  },
}

function renderChart(
  series: MetricSeriesSpec[],
  title: string,
): { canvas: SvgCanvas; chart: Chart } {
  const canvas = createCanvas(1000, 520, SvgExportFlag.ConvertTextToPaths)
  const chart = new Chart(canvas as any, {
    type: 'line',
    plugins: [verticalLinePlugin],
    data: {
      labels: data.map((d) => d.date),
      datasets: series.map(({ key, label, color }) => ({
        label,
        data: getNullableMetricSeries(data, key),
        borderColor: color,
        backgroundColor: color,
        tension: 0.2,
        pointRadius,
        pointStyle,
        pointBackgroundColor: COLORS.marker,
        pointBorderColor: COLORS.marker,
        borderWidth: 2,
        spanGaps: true,
      })),
    },
    options: {
      responsive: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 14,
            font: { size: 15, family: 'Inter' },
          },
        },
        title: {
          display: true,
          text: title,
          font: { size: 18, family: 'Inter' },
          padding: { top: 8, bottom: 12 },
        },
      },
      scales: {
        x: {
          ticks: {
            font: { size: 12, family: 'Inter' },
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: 12,
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 13, family: 'Inter' },
          },
        },
      },
    },
  })
  return { canvas, chart }
}

const combo = renderChart(
  COMBO_SERIES,
  'npm Top Publishing — Adoption Over Time',
)
await writeChartSvg(combo.canvas, 'chart-daily-combo.svg')
combo.chart.destroy()

const independent = renderChart(
  INDEPENDENT_SERIES,
  'npm Top Publishing — Independent Metrics Over Time',
)
await writeChartSvg(independent.canvas, 'chart-daily-independent.svg')
independent.chart.destroy()
