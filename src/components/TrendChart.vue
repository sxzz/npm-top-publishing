<script setup lang="ts">
import Chart from 'chart.js/auto'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  getListUpdateIndices,
  getNullableMetricSeries,
  STAGED_METRICS,
  stagedMethodIndex,
  type DailyStat,
} from '../../shared/model.ts'
import { countState, STATES, TREND_CHECKS, type PackageState } from '../data.ts'
import { formatCompact, formatNumber, formatShortDate } from '../format.ts'
import type {
  ChartDataset,
  Chart as ChartInstance,
  Plugin,
  ScriptableLineSegmentContext,
} from 'chart.js'

const props = defineProps<{
  stats: DailyStat[]
  view: 'checks' | 'states'
}>()

const INK = '#12141c'
const ULTRA = '#3b4fe0'
const MUTED = '#5b6273'
const RULE = 'rgb(18 20 28 / 9%)'
const FONT_MONO = '"Martian Mono", ui-monospace, monospace'

const canvas = ref<HTMLCanvasElement>()
let chart: ChartInstance | undefined

// States are only plotted from the first snapshot that recorded the full
// breakdown. Earlier snapshots used a coarser schema that cannot be split.
function stateSeries(key: PackageState): (number | null)[] {
  return props.stats.map((stat) =>
    stat.oidcProvenanceStaged == null ? null : countState(stat, key),
  )
}

// States whose split depends on the staged check.
const STAGED_STATES = new Set<PackageState>(['full', 'trusted'])

// True for segments that end on or before the first snapshot using the
// current staged method, so the jump into it is marked as well.
function isOldStagedSegment(ctx: ScriptableLineSegmentContext): boolean {
  const index = stagedMethodIndex(props.stats)
  return index !== -1 && ctx.p1DataIndex <= index
}

function datasets(): ChartDataset<'line', (number | null)[]>[] {
  if (props.view === 'states') {
    return STATES.map((state) => ({
      label: state.label,
      data: stateSeries(state.key),
      borderColor: state.color,
      backgroundColor: state.color,
      borderWidth: 0,
      fill: true,
      pointRadius: 0,
      stack: 'states',
      // Areas cannot be dashed, so the old split is faded instead.
      segment: STAGED_STATES.has(state.key)
        ? {
            backgroundColor: (ctx) =>
              isOldStagedSegment(ctx) ? `${state.color}80` : undefined,
          }
        : undefined,
    }))
  }
  return TREND_CHECKS.map((series) => ({
    label: series.label,
    data: getNullableMetricSeries(props.stats, series.key),
    borderColor: series.color,
    backgroundColor: series.color,
    borderDash: [...series.dash],
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.2,
    segment: STAGED_METRICS.has(series.key)
      ? {
          borderDash: (ctx) => (isOldStagedSegment(ctx) ? [4, 4] : undefined),
        }
      : undefined,
  }))
}

function markerPlugin(indices: Set<number>): Plugin<'line'> {
  return {
    id: 'markers',
    afterDatasetsDraw({ ctx, chartArea, scales }) {
      ctx.save()
      const stagedIndex = stagedMethodIndex(props.stats)
      if (stagedIndex > 0) {
        const x = scales.x.getPixelForValue(stagedIndex)
        ctx.strokeStyle = ULTRA
        ctx.fillStyle = ULTRA
        ctx.setLineDash([4, 3])
        ctx.lineWidth = 1
        ctx.font = `500 10px ${FONT_MONO}`
        ctx.textAlign = 'right'
        ctx.beginPath()
        ctx.moveTo(x, chartArea.top)
        ctx.lineTo(x, chartArea.bottom)
        ctx.stroke()
        ctx.fillText('new staged check', x - 5, chartArea.top + 24)
      }
      ctx.strokeStyle = INK
      ctx.fillStyle = INK
      ctx.setLineDash([2, 3])
      ctx.lineWidth = 1
      ctx.font = `500 10px ${FONT_MONO}`
      ctx.textAlign = 'left'
      for (const index of indices) {
        const x = scales.x.getPixelForValue(index)
        ctx.beginPath()
        ctx.moveTo(x, chartArea.top)
        ctx.lineTo(x, chartArea.bottom)
        ctx.stroke()
        const stat = props.stats[index]
        if (stat) {
          ctx.fillText(
            `list → ${formatCompact(stat.listSize)}`,
            x + 5,
            chartArea.top + 10,
          )
        }
      }
      ctx.restore()
    },
  }
}

function render(): void {
  if (!canvas.value) return
  chart?.destroy()
  const stacked = props.view === 'states'
  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      labels: props.stats.map((stat) => formatShortDate(stat.date)),
      datasets: datasets(),
    },
    plugins: [markerPlugin(getListUpdateIndices(props.stats))],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: INK,
          titleFont: { family: FONT_MONO, size: 11, weight: 500 },
          bodyFont: { family: FONT_MONO, size: 11 },
          padding: 10,
          cornerRadius: 2,
          boxWidth: 8,
          boxHeight: 8,
          boxPadding: 4,
          itemSort: (a, b) => Number(b.raw) - Number(a.raw),
          filter: (item) => item.raw != null,
          callbacks: {
            label: (item) =>
              ` ${item.dataset.label}  ${formatNumber(Number(item.raw))}`,
            labelColor: (item) => {
              const color = String(item.dataset.borderColor)
              return { backgroundColor: color, borderColor: color }
            },
          },
        },
      },
      scales: {
        x: {
          border: { color: INK },
          grid: { display: false },
          ticks: {
            color: MUTED,
            font: { family: FONT_MONO, size: 10 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 7,
          },
        },
        y: {
          stacked,
          beginAtZero: true,
          border: { display: false },
          grid: { color: RULE },
          ticks: {
            color: MUTED,
            font: { family: FONT_MONO, size: 10 },
            callback: (value) => formatCompact(Number(value)),
          },
        },
      },
    },
  })
}

watch(() => props.view, render)

onMounted(async () => {
  // Canvas text is drawn once, so wait for the web font before the first paint.
  await document.fonts.ready
  render()
})

onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <div class="trend-chart">
    <canvas
      ref="canvas"
      role="img"
      :aria-label="
        view === 'checks'
          ? 'Line chart of packages using each publishing check over time'
          : 'Stacked area chart of packages in each publishing state over time'
      "
    />
  </div>
</template>
