<script setup lang="ts">
import { computed, ref } from 'vue'
import dailyStatsUrl from '../daily-stats.json?url'
import fullResultsUrl from '../full-results.json?url'
import { metric } from '../shared/model.ts'
import PackageGrid from './components/PackageGrid.vue'
import PackageList from './components/PackageList.vue'
import TrendChart from './components/TrendChart.vue'
import {
  CHECKS,
  countState,
  packages,
  rows,
  STATE_BY_KEY,
  STATES,
  stats,
  TREND_CHECKS,
  type CheckKey,
  type PackageRow,
  type PackageState,
} from './data.ts'
import {
  formatDate,
  formatDelta,
  formatNumber,
  formatPercent,
} from './format.ts'

type Focus =
  { kind: 'state'; key: PackageState } | { kind: 'check'; key: CheckKey }

const repositoryUrl = 'https://github.com/sxzz/npm-top-publishing'
const upstreamUrl = 'https://github.com/wooorm/npm-high-impact'

if (stats.length < 2) {
  throw new Error('daily-stats.json must include at least two snapshots')
}
const latest = stats.at(-1)!
const previous = stats.at(-2)!
const first = stats[0]!
const total = latest.total
const fullChain = countState(latest, 'full')

const focus = ref<Focus | null>(null)
const trendView = ref<'checks' | 'states'>('checks')

const stateRows = STATES.map((state) => {
  const count = countState(latest, state.key)
  return {
    ...state,
    count,
    percent: formatPercent(count, total),
    delta: formatDelta(count - countState(previous, state.key)),
  }
})

const checkRows = CHECKS.map((check) => {
  const count = metric(latest, check.key)
  return {
    ...check,
    count,
    percent: formatPercent(count, total),
    delta: formatDelta(count - metric(previous, check.key)),
  }
})

const match = computed<((row: PackageRow) => boolean) | null>(() => {
  const current = focus.value
  if (!current) return null
  if (current.kind === 'state') return (row) => row.state === current.key
  return (row) => row[current.key]
})

const focusLabel = computed(() => {
  const current = focus.value
  if (!current) return null
  if (current.kind === 'state') return STATE_BY_KEY[current.key].label
  return `${CHECKS.find((check) => check.key === current.key)!.label} used`
})

const gridLabel = `Grid of ${formatNumber(rows.length)} npm packages in rank order, colored by publishing state. ${stateRows
  .map((row) => `${row.label}: ${formatNumber(row.count)}`)
  .join(', ')}. The package table below lists the same data.`

function isFocused(kind: Focus['kind'], key: string): boolean {
  return focus.value?.kind === kind && focus.value.key === key
}

function toggleFocus(next: Focus): void {
  focus.value = isFocused(next.kind, next.key) ? null : next
}
</script>

<template>
  <a class="skip-link" href="#packages">Skip to the package table</a>

  <header class="masthead">
    <a class="wordmark" :href="repositoryUrl" translate="no">
      npm<span>/</span>top-publishing
    </a>
    <p class="masthead-meta">
      Snapshot
      <time :datetime="latest.date">{{ formatDate(latest.date) }}</time>
    </p>
  </header>

  <main>
    <section class="hero" aria-labelledby="page-title">
      <h1 id="page-title">
        <span class="hero-count">{{ formatNumber(fullChain) }}</span>
        of the top {{ formatNumber(total) }} npm packages are published with the
        full chain.
      </h1>
      <p class="hero-lede">
        Full chain means OIDC trusted publishing, a provenance attestation and
        staged publishing on the latest version. Each square below is one
        package from
        <a :href="upstreamUrl" translate="no">npm-high-impact</a>, ranked from
        the top left. Hover a square to see which package it is.
      </p>
    </section>

    <section class="explorer" aria-label="Packages by publishing state">
      <div class="filters">
        <div class="filter-group">
          <h2 class="filter-title">Publishing state</h2>
          <ul class="legend">
            <li v-for="row in stateRows" :key="row.key">
              <button
                type="button"
                class="legend-item"
                :aria-pressed="isFocused('state', row.key)"
                @click="toggleFocus({ kind: 'state', key: row.key })"
              >
                <span
                  class="legend-swatch"
                  :style="{ background: row.color }"
                  aria-hidden="true"
                />
                <span class="legend-label">{{ row.label }}</span>
                <span class="legend-count">{{ formatNumber(row.count) }}</span>
                <span class="legend-percent">{{ row.percent }}</span>
                <span
                  class="legend-delta"
                  :title="`Change since ${formatDate(previous.date)}`"
                  >{{ row.delta }}</span
                >
              </button>
            </li>
          </ul>
        </div>

        <div class="filter-group">
          <h2 class="filter-title">Single check</h2>
          <ul class="legend">
            <li v-for="row in checkRows" :key="row.key">
              <button
                type="button"
                class="legend-item"
                :aria-pressed="isFocused('check', row.key)"
                @click="toggleFocus({ kind: 'check', key: row.key })"
              >
                <span class="legend-swatch is-outline" aria-hidden="true" />
                <span class="legend-label">{{ row.label }}</span>
                <span class="legend-count">{{ formatNumber(row.count) }}</span>
                <span class="legend-percent">{{ row.percent }}</span>
                <span
                  class="legend-delta"
                  :title="`Change since ${formatDate(previous.date)}`"
                  >{{ row.delta }}</span
                >
              </button>
            </li>
          </ul>
          <p class="filter-hint">
            Select a row to highlight its packages in the grid and the table.
            Changes are since {{ formatDate(previous.date) }}.
          </p>
        </div>
      </div>

      <PackageGrid :rows :match :label="gridLabel" />
      <p class="grid-footnote">
        <span class="legend-swatch is-missing" aria-hidden="true" />
        {{ formatNumber(latest.listSize - total) }} outlined squares are
        packages whose registry data could not be read.
      </p>
    </section>

    <section class="glossary" aria-labelledby="glossary-title">
      <h2 id="glossary-title" class="section-title">What each check means</h2>
      <dl>
        <div v-for="check in CHECKS" :key="check.key">
          <dt>{{ check.label }}</dt>
          <dd>{{ check.description }}</dd>
        </div>
      </dl>
    </section>

    <section class="trend" aria-labelledby="trend-title">
      <div class="section-head">
        <h2 id="trend-title" class="section-title">Over time</h2>
        <div class="segmented" role="group" aria-label="Chart view">
          <button
            type="button"
            :aria-pressed="trendView === 'checks'"
            @click="trendView = 'checks'"
          >
            Each check
          </button>
          <button
            type="button"
            :aria-pressed="trendView === 'states'"
            @click="trendView = 'states'"
          >
            Publishing state
          </button>
        </div>
      </div>

      <ul class="chart-legend" aria-hidden="true">
        <template v-if="trendView === 'checks'">
          <li v-for="series in TREND_CHECKS" :key="series.key">
            <span
              class="line-key"
              :class="{ 'is-dashed': series.dash.length > 0 }"
              :style="{ color: series.color }"
            />{{ series.label }}
          </li>
        </template>
        <template v-else>
          <li v-for="state in STATES" :key="state.key">
            <span
              class="legend-swatch"
              :style="{ background: state.color }"
            />{{ state.label }}
          </li>
        </template>
      </ul>

      <TrendChart :stats :view="trendView" />

      <p class="chart-note">
        Dotted lines mark days when the upstream package list changed size,
        which shifts every count. Tracking began
        {{ formatDate(first.date) }}; provenance, staged and the full breakdown
        by state are recorded from late May 2026.
      </p>
    </section>

    <section id="packages" class="packages" aria-labelledby="packages-title">
      <div class="section-head">
        <h2 id="packages-title" class="section-title">Every package</h2>
      </div>
      <PackageList
        :packages
        :match
        :focus-label="focusLabel"
        @clear-focus="focus = null"
      />
    </section>
  </main>

  <footer class="site-footer">
    <p>
      Updated daily by a GitHub Actions job that reads the latest version of
      each package from the registry.
    </p>
    <ul>
      <li><a :href="fullResultsUrl">full-results.json</a></li>
      <li><a :href="dailyStatsUrl">daily-stats.json</a></li>
      <li><a :href="repositoryUrl">Source on GitHub</a></li>
      <li><a :href="`${repositoryUrl}/issues`">Report a data problem</a></li>
    </ul>
  </footer>
</template>
