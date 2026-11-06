<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  CHECKS,
  STATE_BY_KEY,
  type CheckKey,
  type PackageRow,
} from '../data.ts'
import { formatNumber } from '../format.ts'

const props = defineProps<{
  packages: PackageRow[]
  match: ((row: PackageRow) => boolean) | null
  focusLabel: string | null
}>()

const emit = defineEmits<{ clearFocus: [] }>()

const PAGE_SIZE = 50

const query = ref('')
const limit = ref(PAGE_SIZE)
// Ticked checks must all pass; unticked ones are not filtered on.
const requiredChecks = ref<CheckKey[]>([])

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return props.packages.filter(
    (row) =>
      (!props.match || props.match(row)) &&
      requiredChecks.value.every((key) => row[key]) &&
      (!needle || row.name.toLowerCase().includes(needle)),
  )
})

const visible = computed(() => filtered.value.slice(0, limit.value))

watch([query, requiredChecks, () => props.match], () => {
  limit.value = PAGE_SIZE
})

function packageUrl(name: string): string {
  return `https://npmx.dev/package/${encodeURIComponent(name)}`
}
</script>

<template>
  <div class="package-list">
    <div class="list-controls">
      <label class="search">
        <span class="visually-hidden">Search packages by name</span>
        <input
          v-model="query"
          type="search"
          placeholder="Search by package name"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      <fieldset class="check-filter">
        <legend class="visually-hidden">Must pass</legend>
        <label v-for="check in CHECKS" :key="check.key">
          <input v-model="requiredChecks" type="checkbox" :value="check.key" />
          {{ check.label }}
        </label>
      </fieldset>
      <p class="list-count" aria-live="polite">
        <strong>{{ formatNumber(filtered.length) }}</strong>
        {{ filtered.length === 1 ? 'package' : 'packages' }}
        <template v-if="focusLabel">
          · {{ focusLabel }}
          <button type="button" class="text-button" @click="emit('clearFocus')">
            Show all
          </button>
        </template>
      </p>
    </div>

    <table v-if="filtered.length > 0">
      <thead>
        <tr>
          <th scope="col" class="col-rank">Rank</th>
          <th scope="col">Package</th>
          <th scope="col" class="col-author">Publisher</th>
          <th scope="col" class="col-checks">Checks</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in visible" :key="row.name">
          <td class="col-rank">{{ formatNumber(row.rank) }}</td>
          <td class="col-name">
            <span
              class="state-swatch"
              :style="{ background: STATE_BY_KEY[row.state].color }"
              :title="STATE_BY_KEY[row.state].label"
            />
            <a :href="packageUrl(row.name)" translate="no">{{ row.name }}</a>
            <span class="version">{{ row.version }}</span>
          </td>
          <td class="col-author">{{ row.author ?? '—' }}</td>
          <td class="col-checks">
            <ul class="check-marks">
              <li :class="{ on: row.oidc }">
                OIDC<span class="visually-hidden">{{
                  row.oidc ? ': yes' : ': no'
                }}</span>
              </li>
              <li :class="{ on: row.provenance }">
                Prov<span class="visually-hidden">{{
                  row.provenance ? 'enance: yes' : 'enance: no'
                }}</span>
              </li>
              <li :class="{ on: row.staged }">
                Staged<span class="visually-hidden">{{
                  row.staged ? ': yes' : ': no'
                }}</span>
              </li>
            </ul>
          </td>
        </tr>
      </tbody>
    </table>

    <p v-else class="list-empty">
      No package matches the search and filters. Clear the search or untick a
      check.
    </p>

    <button
      v-if="visible.length < filtered.length"
      type="button"
      class="more-button"
      @click="limit += PAGE_SIZE * 4"
    >
      Show
      {{
        formatNumber(Math.min(PAGE_SIZE * 4, filtered.length - visible.length))
      }}
      more
    </button>
  </div>
</template>
