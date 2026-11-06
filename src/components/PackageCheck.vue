<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  CHECKS,
  packages,
  STATE_BY_KEY,
  stateOf,
  type PackageState,
} from '../data.ts'
import { formatNumber } from '../format.ts'
import { latestManifestUrl, readManifest, type Manifest } from '../registry.ts'

interface CheckResult extends Manifest {
  name: string
  state: PackageState
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; name: string }
  | { kind: 'done'; result: CheckResult }
  | { kind: 'error'; name: string; message: string }

const rankByName = new Map(packages.map((row) => [row.name, row.rank]))

const input = ref('')
const status = ref<Status>({ kind: 'idle' })
const section = ref<HTMLElement>()
const field = ref<HTMLInputElement>()
let controller: AbortController | undefined

const result = computed(() =>
  status.value.kind === 'done' ? status.value.result : null,
)
const rank = computed(() =>
  result.value ? rankByName.get(result.value.name) : undefined,
)

async function check(raw: string): Promise<void> {
  const name = raw.trim()
  if (!name) return
  input.value = name

  // A newer lookup wins; drop the response of the one still in flight.
  controller?.abort()
  const current = new AbortController()
  controller = current
  status.value = { kind: 'loading', name }

  try {
    const response = await fetch(latestManifestUrl(name), {
      signal: current.signal,
    })
    if (!response.ok) {
      status.value = {
        kind: 'error',
        name,
        message:
          response.status === 404
            ? 'No package with this name exists on the registry.'
            : `The registry answered with HTTP ${response.status}.`,
      }
      return
    }
    const manifest = readManifest(await response.json())
    status.value = {
      kind: 'done',
      result: {
        name,
        ...manifest,
        state: stateOf(manifest.oidc, manifest.provenance, manifest.staged),
      },
    }
  } catch {
    if (current.signal.aborted) return
    status.value = {
      kind: 'error',
      name,
      message:
        'Could not read the registry. Check your connection and try again.',
    }
  }
}

// Used by the package table to hand over a search that matched nothing.
function checkFromOutside(name: string): void {
  section.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  field.value?.focus({ preventScroll: true })
  check(name)
}

defineExpose({ check: checkFromOutside })

function packageUrl(name: string): string {
  return `https://npmx.dev/package/${encodeURIComponent(name)}`
}
</script>

<template>
  <section
    id="check"
    ref="section"
    class="checker"
    aria-labelledby="checker-title"
  >
    <h2 id="checker-title" class="section-title">Check any package</h2>
    <p class="checker-lede">
      Looks up the latest version of any npm package, including ones outside the
      tracked list.
    </p>

    <form class="checker-form" @submit.prevent="check(input)">
      <label class="search">
        <span class="visually-hidden">Package name</span>
        <input
          ref="field"
          v-model="input"
          type="text"
          placeholder="e.g. vite or @vue/compiler-sfc"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          translate="no"
        />
      </label>
      <button
        type="submit"
        class="checker-submit"
        :disabled="!input.trim() || status.kind === 'loading'"
      >
        {{ status.kind === 'loading' ? 'Checking…' : 'Check' }}
      </button>
    </form>

    <div class="checker-output" aria-live="polite">
      <p v-if="status.kind === 'loading'" class="checker-message">
        Reading <span translate="no">{{ status.name }}</span> from the registry…
      </p>

      <p v-else-if="status.kind === 'error'" class="checker-message is-error">
        <strong translate="no">{{ status.name }}</strong
        >: {{ status.message }}
      </p>

      <article v-else-if="result" class="checker-result">
        <header class="checker-head">
          <span
            class="state-swatch"
            :style="{ background: STATE_BY_KEY[result.state].color }"
            aria-hidden="true"
          />
          <a
            class="checker-name"
            :href="packageUrl(result.name)"
            translate="no"
            >{{ result.name }}</a
          >
          <span class="version">{{ result.version }}</span>
          <span class="checker-state">
            {{ STATE_BY_KEY[result.state].label }}
          </span>
        </header>
        <p class="checker-meta">
          <template v-if="result.author">{{ result.author }} · </template>
          <template v-if="rank"
            >Rank {{ formatNumber(rank) }} in the tracked list</template
          >
          <template v-else>Not in the tracked list</template>
        </p>

        <dl class="checker-checks">
          <div
            v-for="item in CHECKS"
            :key="item.key"
            :class="{ on: result[item.key] }"
          >
            <dt>
              {{ item.label }}
              <span class="checker-verdict">{{
                result[item.key] ? 'Yes' : 'No'
              }}</span>
            </dt>
            <dd>
              {{ item.description }}
              <template v-if="item.key === 'staged' && result.approver">
                Approved by
                <span translate="no">{{ result.approver }}</span
                >.
              </template>
            </dd>
          </div>
        </dl>
      </article>
    </div>
  </section>
</template>
