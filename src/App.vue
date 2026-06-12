<script setup lang="ts">
import Chart from 'chart.js/auto'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import dailyStatsData from '../daily-stats.json'
import dailyStatsUrl from '../daily-stats.json?url'
import fullResultsData from '../full-results.json'
import fullResultsUrl from '../full-results.json?url'
import {
  classifyResults,
  COLORS,
  COMBO_SERIES,
  getListUpdateIndices,
  getMetricSeries,
  INDEPENDENT_SERIES,
  metric,
  type DailyStat,
  type MetricKey,
  type MetricSeriesSpec,
  type Result,
  type Results,
} from '../shared/model.ts'
import type {
  Chart as ChartInstance,
  LegendItem,
  Plugin,
  ScriptableContext,
  TooltipItem,
} from 'chart.js'

interface CategoryGroup {
  title: string
  description: string
  names: string[]
  color: string
}

interface MixRow {
  label: string
  value: number
  color: string
}

interface MixRowGroup {
  label: string
  rows: MixRow[]
  weight: number
}

interface ListUpdate {
  date: string
  delta: number
  nextSize: number
  previousSize: number
}

const repositoryUrl = 'https://github.com/sxzz/npm-top-publishing'
const readmeUrl = `${repositoryUrl}#readme`
const issuesUrl = `${repositoryUrl}/issues`
const licenseUrl = `${repositoryUrl}/blob/main/LICENSE`
const initialPackageCount = 8
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
  year: 'numeric',
})
const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
})

const data = dailyStatsData as DailyStat[]
const resultMap = fullResultsData as unknown as Results
const classified = classifyResults(resultMap)
const comboCanvas = ref<HTMLCanvasElement>()
const mixCanvas = ref<HTMLCanvasElement>()
const independentCanvas = ref<HTMLCanvasElement>()
const charts: ChartInstance[] = []

const latest = computed(() => data.at(-1))
const firstSnapshot = computed(() => data[0])
const previous = computed(() => data.at(-2))
const total = computed(() => latest.value?.total ?? 0)

const statCards = computed(() => {
  const current = latest.value
  const prev = previous.value
  if (!current || !prev) return []

  const provenance = metric(current, 'provenance')
  const oidc = metric(current, 'oidc')
  const staged = metric(current, 'staged')
  const trusted = metric(current, 'oidcAndProvenance')
  const fullChain = metric(current, 'oidcProvenanceStaged')

  return [
    {
      label: 'Tracked Packages',
      value: formatNumber(total.value),
      detail: `${formatDelta(total.value - prev.total)} since ${formatDate(prev.date)}`,
      accent: COLORS.staged,
    },
    {
      label: 'OIDC + Provenance',
      value: formatNumber(trusted),
      detail: `${formatPercent(trusted)} of the current set`,
      accent: COLORS.oidcAndProvenance,
    },
    {
      label: 'Provenance Attestations',
      value: formatNumber(provenance),
      detail: `${formatPpDelta(provenance, prev, 'provenance')} since ${formatDate(prev.date)}`,
      accent: COLORS.provenance,
    },
    {
      label: 'OIDC Publishing',
      value: formatNumber(oidc),
      detail: `${formatPpDelta(oidc, prev, 'oidc')} since ${formatDate(prev.date)}`,
      accent: COLORS.oidc,
    },
    {
      label: 'Staged Publishing',
      value: formatNumber(staged),
      detail: `${formatDelta(staged - metric(prev, 'staged'))} since ${formatDate(prev.date)}`,
      accent: COLORS.staged,
    },
    {
      label: 'Full Security Chain',
      value: formatNumber(fullChain),
      detail: `${formatPercent(fullChain)} use OIDC, provenance, and staged publishing`,
      accent: COLORS.oidcProvenanceStaged,
    },
  ]
})

const mixRows = computed<MixRow[]>(() => {
  const current = latest.value
  return current ? metricRows(current, COMBO_SERIES) : []
})

const stagedMixRows = computed<MixRow[]>(() => {
  const current = latest.value
  if (!current) return []
  const staged = metric(current, 'staged')
  return [
    {
      label: 'Staged Publishing',
      value: staged,
      color: COLORS.staged,
    },
    {
      label: 'Non-staged',
      value: Math.max(total.value - staged, 0),
      color: COLORS.nonStaged,
    },
  ]
})

const mixRowGroups = computed<MixRowGroup[]>(() => [
  {
    label: 'Staged publishing',
    rows: stagedMixRows.value,
    weight: 1,
  },
  {
    label: 'Publishing mode',
    rows: mixRows.value,
    weight: 3,
  },
])

const trendRows = computed(() => {
  const current = latest.value
  const prev = previous.value
  if (!current || !prev) return []

  const provenance = metric(current, 'provenance')
  const oidc = metric(current, 'oidc')
  const trusted = metric(current, 'oidcAndProvenance')
  const lastListUpdate = findLastListUpdate(data)
  const currentRange = formatDateRange(prev.date, current.date)

  return [
    {
      label: 'Provenance Movement',
      value: formatDelta(provenance - metric(prev, 'provenance')),
      detail: currentRange,
    },
    {
      label: 'OIDC Movement',
      value: formatDelta(oidc - metric(prev, 'oidc')),
      detail: currentRange,
    },
    {
      label: 'Last List Update',
      value: lastListUpdate ? formatDate(lastListUpdate.date) : 'None',
      detail: lastListUpdate
        ? `${formatDelta(lastListUpdate.delta)} entries, ${formatNumber(lastListUpdate.previousSize)} to ${formatNumber(lastListUpdate.nextSize)}`
        : 'No upstream list changes in history',
    },
    {
      label: 'Trusted Movement',
      value: formatDelta(trusted - metric(prev, 'oidcAndProvenance')),
      detail: currentRange,
    },
  ]
})

const categoryGroups: CategoryGroup[] = [
  {
    title: 'Full Chain',
    description:
      'Packages using OIDC, provenance attestations, and staged publishing.',
    names: classified.oidcProvenanceStaged,
    color: COLORS.oidcProvenanceStaged,
  },
  {
    title: 'OIDC + Provenance',
    description:
      'Packages using trusted publishing with provenance attestations.',
    names: classified.oidcAndProvenance,
    color: COLORS.oidcAndProvenance,
  },
  {
    title: 'OIDC Without Provenance',
    description:
      'Packages using trusted publishing while provenance is disabled.',
    names: classified.oidcWithoutProvenance,
    color: COLORS.oidcWithoutProvenance,
  },
  {
    title: 'Provenance Only',
    description:
      'Packages with provenance attestations but no detected OIDC publishing.',
    names: classified.provenanceOnly,
    color: COLORS.provenanceOnly,
  },
]
const visiblePackageCounts = ref(
  categoryGroups.map((group) =>
    Math.min(initialPackageCount, group.names.length),
  ),
)

function metricRows(stat: DailyStat, series: MetricSeriesSpec[]): MixRow[] {
  return series.map(({ key, label, color }) => ({
    label,
    value: metric(stat, key),
    color,
  }))
}

onMounted(async () => {
  if (!latest.value || !firstSnapshot.value || !previous.value) {
    throw new Error('daily-stats.json must include at least two snapshots')
  }
  await nextTick()
  renderCharts()
})

onBeforeUnmount(() => {
  destroyCharts()
})

function renderCharts(): void {
  if (!comboCanvas.value || !mixCanvas.value || !independentCanvas.value) {
    return
  }

  destroyCharts()
  const listUpdateIndices = getListUpdateIndices(data)
  Chart.defaults.font.family =
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  Chart.defaults.color = '#5f6d66'

  charts.push(
    createLineChart(comboCanvas.value, COMBO_SERIES, listUpdateIndices),
    createMixChart(mixCanvas.value),
    createLineChart(
      independentCanvas.value,
      INDEPENDENT_SERIES,
      listUpdateIndices,
    ),
  )
}

function createLineChart(
  canvas: HTMLCanvasElement,
  series: MetricSeriesSpec[],
  listUpdateIndices: Set<number>,
): ChartInstance {
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map((item) => formatShortDate(item.date)),
      datasets: series.map((item) =>
        createLineDataset(item, listUpdateIndices),
      ),
    },
    plugins: [createListUpdateMarkerPlugin(listUpdateIndices)],
    options: lineChartOptions(),
  })
}

function createMixChart(canvas: HTMLCanvasElement): ChartInstance {
  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: mixRows.value.map((row) => row.label),
      datasets: mixRowGroups.value.map((group) => ({
        label: group.label,
        data: group.rows.map((row) => row.value),
        backgroundColor: group.rows.map((row) => row.color),
        borderColor: '#fff',
        borderWidth: 4,
        weight: group.weight,
      })),
    },
    options: mixChartOptions(),
  })
}

function destroyCharts(): void {
  while (charts.length > 0) {
    charts.pop()?.destroy()
  }
}

function createLineDataset(
  { key, label, color }: MetricSeriesSpec,
  listUpdateIndices: Set<number>,
) {
  return {
    label,
    data: getMetricSeries(data, key),
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: (context: ScriptableContext<'line'>) =>
      listUpdateIndices.has(context.dataIndex) ? 5 : 0,
    pointStyle: (context: ScriptableContext<'line'>) =>
      listUpdateIndices.has(context.dataIndex) ? 'triangle' : 'circle',
    pointBackgroundColor: COLORS.marker,
    pointBorderColor: COLORS.marker,
    tension: 0.24,
  }
}

function createListUpdateMarkerPlugin(
  listUpdateIndices: Set<number>,
): Plugin<'line'> {
  return {
    id: 'listUpdateMarker',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart
      const xScale = scales.x
      if (!xScale || listUpdateIndices.size === 0) return
      ctx.save()
      ctx.strokeStyle = 'rgb(95 109 102 / 48%)'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      for (const dataIndex of listUpdateIndices) {
        const x = xScale.getPixelForValue(dataIndex)
        ctx.beginPath()
        ctx.moveTo(x, chartArea.top)
        ctx.lineTo(x, chartArea.bottom)
        ctx.stroke()
      }
      ctx.restore()
    },
  }
}

function lineChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          boxWidth: 12,
          padding: 14,
        },
      },
      tooltip: {
        callbacks: {
          labelColor: lineTooltipLabelColor,
          label: (context: { dataset: { label?: string }; raw: unknown }) =>
            `${context.dataset.label}: ${formatNumber(Number(context.raw))}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
        },
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: string | number) => formatCompact(Number(value)),
        },
        grid: {
          color: 'rgb(23 32 27 / 8%)',
        },
      },
    },
  }
}

function mixChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '58%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          boxWidth: 12,
          padding: 14,
          generateLabels: mixLegendLabels,
        },
        onClick: toggleMixLegendItem,
      },
      tooltip: {
        callbacks: {
          labelColor: mixTooltipLabelColor,
          label: mixTooltipLabel,
        },
      },
    },
  }
}

function lineTooltipLabelColor(context: {
  dataset: { borderColor?: unknown; backgroundColor?: unknown }
}) {
  const color = context.dataset.borderColor ?? context.dataset.backgroundColor
  const fallbackColor = COLORS.marker
  const datasetColor = typeof color === 'string' ? color : fallbackColor

  return {
    backgroundColor: datasetColor,
    borderColor: datasetColor,
  }
}

function mixRowsForDataset(datasetIndex: number): MixRow[] {
  return datasetIndex === 0 ? stagedMixRows.value : mixRows.value
}

function mixLegendLabels(chart: ChartInstance<'doughnut'>): LegendItem[] {
  return [stagedMixRows.value, mixRows.value].flatMap((rows, datasetIndex) =>
    rows.map((row, index) => {
      const hidden =
        chart.getDatasetMeta(datasetIndex).data[index]?.hidden === true
      return {
        text: row.label,
        fillStyle: row.color,
        strokeStyle: '#fff',
        lineWidth: 2,
        hidden,
        index,
        datasetIndex,
      }
    }),
  )
}

function toggleMixLegendItem(
  _event: unknown,
  item: LegendItem,
  legend: { chart: ChartInstance<'doughnut'> },
): void {
  const datasetIndex = item.datasetIndex
  const index = item.index
  if (datasetIndex == null || index == null) return
  const arc = legend.chart.getDatasetMeta(datasetIndex).data[index]
  if (!arc) return
  arc.hidden = !arc.hidden
  legend.chart.update()
}

function mixTooltipRow(context: TooltipItem<'doughnut'>): MixRow | undefined {
  return mixRowsForDataset(context.datasetIndex)[context.dataIndex]
}

function mixTooltipLabelColor(context: TooltipItem<'doughnut'>) {
  const color = mixTooltipRow(context)?.color ?? COLORS.marker
  return {
    backgroundColor: color,
    borderColor: color,
  }
}

function mixTooltipLabel(context: TooltipItem<'doughnut'>): string {
  const row = mixTooltipRow(context)
  if (!row) return ''
  return `${row.label}: ${formatNumber(row.value)} (${formatPercent(row.value)})`
}

function showMorePackages(index: number): void {
  const group = categoryGroups[index]
  if (!group) return
  visiblePackageCounts.value[index] = group.names.length
}

function visiblePackages(group: CategoryGroup, index: number): string[] {
  return group.names.slice(0, visiblePackageCounts.value[index] ?? 0)
}

function packageStatusText(group: CategoryGroup, index: number): string {
  return `Showing ${formatNumber(visiblePackageCounts.value[index] ?? 0)} of ${formatNumber(group.names.length)}`
}

function moreButtonText(group: CategoryGroup, index: number): string {
  const remaining =
    group.names.length - (visiblePackageCounts.value[index] ?? 0)
  return `Show all ${formatNumber(remaining)}`
}

function packageMeta(name: string): string {
  const result = resultMap[name] ?? fallbackResult
  const [version, author] = result
  return `${version}${author ? ` · ${author}` : ''}`
}

function findLastListUpdate(stats: DailyStat[]): ListUpdate | undefined {
  for (let index = stats.length - 1; index > 0; index--) {
    const current = stats[index]
    const previous = stats[index - 1]
    if (!current || !previous || current.listSize === previous.listSize) {
      continue
    }
    return {
      date: current.date,
      delta: current.listSize - previous.listSize,
      nextSize: current.listSize,
      previousSize: previous.listSize,
    }
  }
}

const fallbackResult: Exclude<Result, null> = [
  'unknown',
  null,
  false,
  false,
  false,
]

function formatDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`))
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatShortDate(value: string): string {
  return shortDateFormatter.format(new Date(`${value}T00:00:00.000Z`))
}

function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} to ${formatDate(end)}`
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatPercent(value: number): string {
  return `${percentRaw(value).toFixed(1)}%`
}

function percentRaw(value: number): number {
  return total.value === 0 ? 0 : (value / total.value) * 100
}

function formatDelta(value: number): string {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '-'}${formatNumber(Math.abs(value))}`
}

function formatPpDelta(
  currentValue: number,
  baseline: DailyStat,
  key: MetricKey,
): string {
  const currentPercent = percentRaw(currentValue)
  const baselineTotal = baseline.total || 1
  const baselinePercent = (metric(baseline, key) / baselineTotal) * 100
  const delta = currentPercent - baselinePercent
  if (delta === 0) return '0.0 pts'
  return `${delta > 0 ? '+' : '-'}${Math.abs(delta).toFixed(1)} pts`
}
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to main content</a>

  <main id="main-content" class="page-shell">
    <template v-if="latest && firstSnapshot && previous">
      <section class="hero" aria-labelledby="page-title">
        <div class="hero-copy">
          <p class="eyebrow">High-Impact npm Publishing Signals</p>
          <h1 id="page-title">npm Top Publishing Dashboard</h1>
          <p class="hero-lede">
            Track trusted publishing,
            <span translate="no">Provenance</span> attestations, and staged
            publishing adoption across high-impact
            <span translate="no">npm</span> packages.
          </p>
          <div class="hero-actions" aria-label="Data and community links">
            <a class="action-link" :href="fullResultsUrl">Full Results</a>
            <a class="action-link" :href="dailyStatsUrl">Daily Stats</a>
            <a class="action-link" :href="readmeUrl">README</a>
            <a class="action-link" :href="repositoryUrl">GitHub</a>
          </div>
        </div>

        <aside class="snapshot" aria-label="Latest snapshot">
          <div>
            <span>Snapshot</span>
            <strong>{{ formatDate(latest.date) }}</strong>
          </div>
          <div>
            <span>Upstream List</span>
            <strong>{{ formatNumber(latest.listSize) }}</strong>
          </div>
          <div>
            <span>History</span>
            <strong>{{ formatNumber(data.length) }} days</strong>
          </div>
        </aside>
      </section>

      <section class="metrics" aria-label="Key metrics">
        <article
          v-for="card in statCards"
          :key="card.label"
          class="metric-card"
          :style="{ '--accent': card.accent }"
        >
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <p>{{ card.detail }}</p>
        </article>
      </section>

      <section class="dashboard-grid" aria-label="Charts and current snapshot">
        <article class="chart-panel chart-panel-large">
          <div class="panel-head">
            <h2>Adoption Over Time</h2>
            <span
              >{{ formatDate(firstSnapshot.date) }} -
              {{ formatDate(latest.date) }}</span
            >
          </div>
          <div class="chart-frame">
            <canvas ref="comboCanvas" aria-label="Adoption over time chart" />
          </div>
          <p class="chart-note data-gap-note">
            <span class="chart-note-marker" aria-hidden="true" />
            <span>
              Dashed vertical lines and triangle markers indicate days when the
              upstream <span translate="no">npm-high-impact</span> package list
              changed. These changes can create discontinuities in the trend.
            </span>
          </p>
        </article>

        <article class="chart-panel">
          <div class="panel-head">
            <h2>Publishing Mix</h2>
            <span>{{ formatNumber(total) }} packages</span>
          </div>
          <div class="chart-frame chart-frame-square">
            <canvas ref="mixCanvas" aria-label="Current publishing mix chart" />
          </div>
        </article>

        <article class="chart-panel">
          <div class="panel-head">
            <h2>Independent Metrics</h2>
            <span>OIDC / Provenance / Staged</span>
          </div>
          <div class="chart-frame">
            <canvas
              ref="independentCanvas"
              aria-label="Independent metrics chart"
            />
          </div>
        </article>

        <article class="chart-panel">
          <div class="panel-head">
            <h2>Current Snapshot</h2>
            <span>{{ formatDate(latest.date) }}</span>
          </div>
          <div class="mix-list">
            <div v-for="row in mixRows" :key="row.label" class="mix-row">
              <div>
                <strong>{{ row.label }}</strong>
                <span
                  >{{ formatNumber(row.value) }} ·
                  {{ formatPercent(row.value) }}</span
                >
              </div>
              <div class="mix-bar" aria-hidden="true">
                <div
                  class="mix-fill"
                  :style="{
                    '--bar-width': `${percentRaw(row.value)}%`,
                    '--bar-color': row.color,
                  }"
                />
              </div>
            </div>
          </div>
        </article>

        <article class="chart-panel">
          <div class="panel-head">
            <h2>Movement</h2>
            <span>from tracked history</span>
          </div>
          <div class="trend-list">
            <article
              v-for="row in trendRows"
              :key="row.label"
              class="trend-item"
            >
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
              <p>{{ row.detail }}</p>
            </article>
          </div>
        </article>
      </section>

      <section class="package-section" aria-labelledby="packages-title">
        <div class="section-head">
          <h2 id="packages-title">Package Groups</h2>
          <span>Ordered by npm-high-impact source rank</span>
        </div>
        <div class="package-grid">
          <article
            v-for="(group, index) in categoryGroups"
            :key="group.title"
            class="package-card"
            :style="{ '--accent': group.color }"
          >
            <header>
              <div>
                <h3>{{ group.title }}</h3>
                <p>{{ group.description }}</p>
              </div>
              <span>{{ formatNumber(group.names.length) }}</span>
            </header>
            <ul :aria-label="`${group.title} packages`">
              <li v-for="name in visiblePackages(group, index)" :key="name">
                <a
                  :href="`https://npmx.dev/package/${encodeURIComponent(name)}`"
                >
                  {{ name }}
                </a>
                <span>{{ packageMeta(name) }}</span>
              </li>
            </ul>
            <footer class="package-card-footer">
              <span v-if="group.names.length === 0">
                No packages in this group
              </span>
              <span v-else>{{ packageStatusText(group, index) }}</span>
              <button
                v-if="(visiblePackageCounts[index] ?? 0) < group.names.length"
                class="more-button"
                type="button"
                @click="showMorePackages(index)"
              >
                {{ moreButtonText(group, index) }}
              </button>
            </footer>
          </article>
        </div>
      </section>

      <section class="community-section" aria-labelledby="community-title">
        <div class="section-head">
          <h2 id="community-title">Community & Data</h2>
          <span>GitHub-ready and open by default</span>
        </div>
        <div class="community-shell">
          <div class="community-summary">
            <p class="community-kicker">Open-source operations</p>
            <h3>
              Use the data, inspect the checks, and improve the coverage in
              public.
            </h3>
            <p>
              The dashboard is designed to ship cleanly on GitHub Pages while
              keeping the raw JSON results available for reproducible analysis.
            </p>
          </div>
          <div class="community-actions" aria-label="Community actions">
            <a :href="repositoryUrl">
              <strong>GitHub Source</strong>
              <span>Implementation, history, and generation workflow</span>
            </a>
            <a :href="issuesUrl">
              <strong>Report an Issue</strong>
              <span>Data anomalies, UI bugs, and coverage gaps</span>
            </a>
            <a :href="fullResultsUrl">
              <strong>Download Full Results</strong>
              <span>Raw package-level publishing data</span>
            </a>
            <a :href="licenseUrl">
              <strong>MIT License</strong>
              <span>Reuse and contribute under the project license</span>
            </a>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>
