<script setup lang="ts">
import Fuse from 'fuse.js'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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

const emit = defineEmits<{ clearFocus: []; check: [name: string] }>()

const PAGE_SIZE = 50
// A fuzzy search over ~17k rows takes tens of milliseconds, so wait for a
// pause in typing instead of searching on every keystroke.
const SEARCH_DELAY_MS = 150

const query = ref('')
const searchTerm = ref('')
const limit = ref(PAGE_SIZE)
// Ticked checks must all pass; unticked ones are not filtered on.
const requiredChecks = ref<CheckKey[]>([])

const fuse = computed(
  () =>
    new Fuse(props.packages, {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'author', weight: 1 },
      ],
      threshold: 0.3,
      // Scoped names put the interesting part far from the start.
      ignoreLocation: true,
    }),
)

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(query, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTerm.value = value.trim()
  }, SEARCH_DELAY_MS)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

// Search results come back best match first; without a search the list stays
// in rank order.
const searched = computed(() =>
  searchTerm.value
    ? fuse.value.search(searchTerm.value).map((result) => result.item)
    : props.packages,
)

const filtered = computed(() =>
  searched.value.filter(
    (row) =>
      (!props.match || props.match(row)) &&
      requiredChecks.value.every((key) => row[key]),
  ),
)

const visible = computed(() => filtered.value.slice(0, limit.value))

watch([searchTerm, requiredChecks, () => props.match], () => {
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
        <span class="visually-hidden">Search packages by name or author</span>
        <input
          v-model="query"
          type="search"
          placeholder="Search by package or author"
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
          <th scope="col" class="col-author">Author</th>
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
      <template v-if="searchTerm">
        Not tracked?
        <button
          type="button"
          class="text-button"
          translate="no"
          @click="emit('check', searchTerm)"
        >
          Check {{ searchTerm }} on the registry
        </button>
      </template>
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
