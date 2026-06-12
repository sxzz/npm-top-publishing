<script setup lang="ts">
import Chart from 'chart.js/auto'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import dailyStatsUrl from '../daily-stats.json?url'
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
  type Result,
  type Results,
} from '../shared/model.ts'
import type {
  Chart as ChartInstance,
  Plugin,
  ScriptableContext,
} from 'chart.js'

interface CategoryGroup {
  title: string
  description: string
  names: string[]
  color: string
}

const repositoryUrl = 'https://github.com/sxzz/npm-top-provenance'
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

const data = ref<DailyStat[]>([])
const resultMap = ref<Results>({})
const loading = ref(true)
const errorMessage = ref('')
const visiblePackageCounts = ref<number[]>([])
const comboCanvas = ref<HTMLCanvasElement>()
const mixCanvas = ref<HTMLCanvasElement>()
const independentCanvas = ref<HTMLCanvasElement>()
const charts: ChartInstance[] = []

const latest = computed(() => data.value.at(-1))
const first = computed(() => data.value[0])
const previous = computed(() => data.value.at(-2))
const total = computed(() => latest.value?.total ?? 0)
const classified = computed(() => classifyResults(resultMap.value))

const statCards = computed(() => {
  const current = latest.value
  const start = first.value
  const prev = previous.value
  if (!current || !start || !prev) return []

  const provenance = metric(current, 'provenance')
  const oidc = metric(current, 'oidc')
  const staged = metric(current, 'staged')
  const trusted = metric(current, 'oidcAndProvenance')
  const fullChain = metric(current, 'oidcProvenanceStaged')

  return [
    {
      label: 'Tracked Packages',
      value: formatNumber(total.value),
      detail: `${formatDelta(total.value - start.total)} since ${formatDate(start.date)}`,
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
      detail: `${formatPpDelta(provenance, start, 'provenance')} since first snapshot`,
      accent: COLORS.provenance,
    },
    {
      label: 'OIDC Publishing',
      value: formatNumber(oidc),
      detail: `${formatPpDelta(oidc, start, 'oidc')} since first snapshot`,
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

const mixRows = computed(() => {
  const current = latest.value
  if (!current) return []
  return COMBO_SERIES.map(({ key, label, color }) => ({
    label,
    value: metric(current, key),
    color,
  }))
})

const trendRows = computed(() => {
  const current = latest.value
  const start = first.value
  const prev = previous.value
  if (!current || !start || !prev) return []

  const provenance = metric(current, 'provenance')
  const oidc = metric(current, 'oidc')
  const trusted = metric(current, 'oidcAndProvenance')

  return [
    {
      label: 'Provenance Growth',
      value: formatDelta(provenance - metric(start, 'provenance')),
      detail: `${formatNumber(metric(start, 'provenance'))} to ${formatNumber(provenance)}`,
    },
    {
      label: 'OIDC Growth',
      value: formatDelta(oidc - metric(start, 'oidc')),
      detail: `${formatNumber(metric(start, 'oidc'))} to ${formatNumber(oidc)}`,
    },
    {
      label: 'List Expansion',
      value: formatDelta(current.listSize - start.listSize),
      detail: `${formatNumber(start.listSize)} to ${formatNumber(current.listSize)} upstream entries`,
    },
    {
      label: 'Daily Trusted Movement',
      value: formatDelta(trusted - metric(prev, 'oidcAndProvenance')),
      detail: `${formatDate(prev.date)} to ${formatDate(current.date)}`,
    },
  ]
})

const categoryGroups = computed<CategoryGroup[]>(() => [
  {
    title: 'Full Chain',
    description:
      'Packages using OIDC, provenance attestations, and staged publishing.',
    names: classified.value.oidcProvenanceStaged,
    color: COLORS.oidcProvenanceStaged,
  },
  {
    title: 'OIDC + Provenance',
    description:
      'Packages using trusted publishing with provenance attestations.',
    names: classified.value.oidcAndProvenance,
    color: COLORS.oidcAndProvenance,
  },
  {
    title: 'OIDC Without Provenance',
    description:
      'Packages using trusted publishing while provenance is disabled.',
    names: classified.value.oidcWithoutProvenance,
    color: COLORS.oidcWithoutProvenance,
  },
  {
    title: 'Provenance Only',
    description:
      'Packages with provenance attestations but no detected OIDC publishing.',
    names: classified.value.provenanceOnly,
    color: COLORS.provenanceOnly,
  },
])

onMounted(async () => {
  try {
    const [dailyStats, fullResults] = await Promise.all([
      loadJson<DailyStat[]>(dailyStatsUrl),
      loadJson<Results>(fullResultsUrl),
    ])
    if (!dailyStats.at(-1) || !dailyStats[0] || !dailyStats.at(-2)) {
      throw new Error('daily-stats.json must include at least two snapshots')
    }
    data.value = dailyStats
    resultMap.value = fullResults
    visiblePackageCounts.value = categoryGroups.value.map((group) =>
      Math.min(initialPackageCount, group.names.length),
    )
    loading.value = false
    await nextTick()
    renderCharts()
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error ? error.message : String(error)
    loading.value = false
  }
})

onBeforeUnmount(() => {
  destroyCharts()
})

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load ${url}`)
  return (await response.json()) as T
}

function renderCharts(): void {
  const currentComboCanvas = comboCanvas.value
  const currentMixCanvas = mixCanvas.value
  const currentIndependentCanvas = independentCanvas.value
  if (!currentComboCanvas || !currentMixCanvas || !currentIndependentCanvas) {
    return
  }

  destroyCharts()
  const listUpdateIndices = getListUpdateIndices(data.value)
  Chart.defaults.font.family =
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  Chart.defaults.color = '#5f6d66'

  charts.push(
    new Chart(currentComboCanvas, {
      type: 'line',
      data: {
        labels: data.value.map((item) => formatShortDate(item.date)),
        datasets: COMBO_SERIES.map(({ key, label, color }) =>
          lineDataset(
            {
              label,
              data: getMetricSeries(data.value, key),
              borderColor: color,
              backgroundColor: color,
            },
            listUpdateIndices,
          ),
        ),
      },
      plugins: [createListUpdateMarkerPlugin(listUpdateIndices)],
      options: lineChartOptions(),
    }),
    new Chart(currentMixCanvas, {
      type: 'doughnut',
      data: {
        labels: mixRows.value.map((row) => row.label),
        datasets: [
          {
            data: mixRows.value.map((row) => row.value),
            backgroundColor: mixRows.value.map((row) => row.color),
            borderColor: '#fff',
            borderWidth: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 14,
            },
          },
          tooltip: {
            callbacks: {
              label: (context) =>
                `${context.label}: ${formatNumber(Number(context.raw))} (${formatPercent(Number(context.raw))})`,
            },
          },
        },
      },
    }),
    new Chart(currentIndependentCanvas, {
      type: 'line',
      data: {
        labels: data.value.map((item) => formatShortDate(item.date)),
        datasets: INDEPENDENT_SERIES.map(({ key, label, color }) =>
          lineDataset(
            {
              label,
              data: getMetricSeries(data.value, key),
              borderColor: color,
              backgroundColor: color,
            },
            listUpdateIndices,
          ),
        ),
      },
      plugins: [createListUpdateMarkerPlugin(listUpdateIndices)],
      options: lineChartOptions(),
    }),
  )
}

function destroyCharts(): void {
  while (charts.length > 0) {
    charts.pop()?.destroy()
  }
}

function lineDataset(
  dataset: {
    label: string
    data: number[]
    borderColor: string
    backgroundColor: string
  },
  listUpdateIndices: Set<number>,
) {
  return {
    ...dataset,
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

function showMorePackages(index: number): void {
  const group = categoryGroups.value[index]
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
  const result = resultMap.value[name] ?? fallbackResult
  const [version, author] = result
  return `${version}${author ? ` · ${author}` : ''}`
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

function formatShortDate(value: string): string {
  return shortDateFormatter.format(new Date(`${value}T00:00:00.000Z`))
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
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
    <section v-if="loading" class="load-error" aria-live="polite">
      <h1>Loading Dashboard…</h1>
      <p>Fetching the latest local JSON data assets.</p>
    </section>

    <section
      v-else-if="errorMessage"
      class="load-error"
      role="alert"
      aria-live="polite"
    >
      <h1>Data Failed to Load</h1>
      <p>
        {{ errorMessage }}. Refresh the page or verify that the built site
        includes the JSON data assets.
      </p>
    </section>

    <template v-else-if="latest && first && previous">
      <section class="hero" aria-labelledby="page-title">
        <div class="hero-copy">
          <p class="eyebrow">High-Impact npm Publishing Signals</p>
          <h1 id="page-title">npm Provenance Dashboard</h1>
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
              >{{ formatDate(first.date) }} -
              {{ formatDate(latest.date) }}</span
            >
          </div>
          <div class="chart-frame">
            <canvas ref="comboCanvas" aria-label="Adoption over time chart" />
          </div>
          <p class="chart-note data-gap-note">
            <span class="chart-note-marker" aria-hidden="true" />
            Dashed vertical lines and triangle markers indicate days when the
            upstream <span translate="no">npm-high-impact</span> package list
            changed. These changes can create discontinuities in the trend.
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
            <ul>
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
              <span>Raw package-level provenance data</span>
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
