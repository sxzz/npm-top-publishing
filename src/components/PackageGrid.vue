<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { STATE_BY_KEY, type PackageRow } from '../data.ts'
import { formatNumber } from '../format.ts'

const props = defineProps<{
  rows: (PackageRow | null)[]
  match: ((row: PackageRow) => boolean) | null
  label: string
}>()

const GAP = 1
const DIMMED_ALPHA = 0.16
const REVEAL_MS = 1200
const MISSING_COLOR = '#c9ced8'

const wrapper = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const layout = ref({ cell: 5, cols: 1, width: 0, height: 0 })
const hovered = ref<{ index: number; x: number; y: number }>()

let revealed = 0
let frame = 0
let observer: ResizeObserver | undefined

const hoveredRow = computed(() =>
  hovered.value ? props.rows[hovered.value.index] : undefined,
)

// Smaller cells on narrow screens keep the grid from becoming a long scroll.
function cellSizeFor(width: number): number {
  if (width >= 900) return 6
  if (width >= 560) return 4
  return 3
}

function measure(): void {
  const el = wrapper.value
  if (!el) return
  const width = el.clientWidth
  const cell = cellSizeFor(width)
  const pitch = cell + GAP
  const cols = Math.max(1, Math.floor((width + GAP) / pitch))
  const height = Math.ceil(props.rows.length / cols) * pitch - GAP
  layout.value = { cell, cols, width: cols * pitch - GAP, height }
}

function context(): CanvasRenderingContext2D | undefined {
  const el = canvas.value
  if (!el) return
  const { width, height } = layout.value
  // eslint-disable-next-line baseline-js/use-baseline -- supported in every browser; Baseline data lists it as limited
  const dpr = window.devicePixelRatio || 1
  if (el.width !== width * dpr || el.height !== height * dpr) {
    el.width = width * dpr
    el.height = height * dpr
  }
  const ctx = el.getContext('2d')
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx ?? undefined
}

function drawRange(ctx: CanvasRenderingContext2D, from: number, to: number) {
  const { cell, cols } = layout.value
  const pitch = cell + GAP
  for (let index = from; index < to; index++) {
    const row = props.rows[index]
    const x = (index % cols) * pitch
    const y = Math.floor(index / cols) * pitch
    if (!row) {
      ctx.globalAlpha = 1
      ctx.strokeStyle = MISSING_COLOR
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1)
      continue
    }
    ctx.globalAlpha = !props.match || props.match(row) ? 1 : DIMMED_ALPHA
    ctx.fillStyle = STATE_BY_KEY[row.state].color
    ctx.fillRect(x, y, cell, cell)
  }
  ctx.globalAlpha = 1
}

function redraw(): void {
  const ctx = context()
  if (!ctx) return
  ctx.clearRect(0, 0, layout.value.width, layout.value.height)
  drawRange(ctx, 0, revealed)
}

// Cells light up in rank order, so the first second of the page shows where
// the most-depended-on packages sit before the long tail fills in.
function reveal(): void {
  const total = props.rows.length
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealed = total
    redraw()
    return
  }
  const start = performance.now()
  const step = (now: number) => {
    const ctx = context()
    if (!ctx) return
    const progress = Math.min(1, (now - start) / REVEAL_MS)
    const eased = 1 - (1 - progress) ** 3
    const next = Math.round(eased * total)
    drawRange(ctx, revealed, next)
    revealed = next
    if (progress < 1) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}

function onPointerMove(event: PointerEvent): void {
  const { cell, cols } = layout.value
  const pitch = cell + GAP
  const col = Math.floor(event.offsetX / pitch)
  const line = Math.floor(event.offsetY / pitch)
  const index = line * cols + col
  if (col >= cols || index < 0 || index >= props.rows.length) {
    hovered.value = undefined
    return
  }
  hovered.value = { index, x: col * pitch, y: line * pitch }
}

function onClick(): void {
  const row = hoveredRow.value
  if (!row) return
  // eslint-disable-next-line baseline-js/use-baseline -- supported in every browser; Baseline data lists it as limited
  window.open(
    `https://npmx.dev/package/${encodeURIComponent(row.name)}`,
    '_blank',
    'noopener',
  )
}

const tooltipStyle = computed(() => {
  if (!hovered.value) return {}
  const { x, y } = hovered.value
  const flip = x > layout.value.width - 260
  return {
    top: `${y + layout.value.cell + 10}px`,
    left: flip ? 'auto' : `${x}px`,
    right: flip ? `${layout.value.width - x - layout.value.cell}px` : 'auto',
  }
})

watch(
  () => props.match,
  () => redraw(),
)

onMounted(() => {
  measure()
  let lastWidth = wrapper.value?.clientWidth
  observer = new ResizeObserver(() => {
    const width = wrapper.value?.clientWidth
    if (width === lastWidth) return
    lastWidth = width
    measure()
    requestAnimationFrame(redraw)
  })
  if (wrapper.value) observer.observe(wrapper.value)
  requestAnimationFrame(reveal)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
})
</script>

<template>
  <div ref="wrapper" class="grid-wrapper">
    <div
      class="grid-stage"
      :style="{ width: `${layout.width}px`, height: `${layout.height}px` }"
    >
      <canvas
        ref="canvas"
        role="img"
        :aria-label="label"
        :style="{ width: `${layout.width}px`, height: `${layout.height}px` }"
        @pointermove="onPointerMove"
        @pointerleave="hovered = undefined"
        @click="onClick"
      />
      <template v-if="hovered">
        <div
          class="grid-cursor"
          aria-hidden="true"
          :style="{
            top: `${hovered.y}px`,
            left: `${hovered.x}px`,
            width: `${layout.cell}px`,
            height: `${layout.cell}px`,
          }"
        />
        <div class="grid-tooltip" aria-hidden="true" :style="tooltipStyle">
          <template v-if="hoveredRow">
            <div class="tooltip-head">
              <span class="tooltip-rank"
                >#{{ formatNumber(hoveredRow.rank) }}</span
              >
              <strong>{{ hoveredRow.name }}</strong>
              <span class="tooltip-version">{{ hoveredRow.version }}</span>
            </div>
            <p v-if="hoveredRow.author" class="tooltip-author">
              {{ hoveredRow.author }}
            </p>
            <ul class="check-marks">
              <li :class="{ on: hoveredRow.oidc }">OIDC</li>
              <li :class="{ on: hoveredRow.provenance }">Provenance</li>
              <li :class="{ on: hoveredRow.staged }">Staged</li>
            </ul>
          </template>
          <template v-else>
            <div class="tooltip-head">
              <span class="tooltip-rank"
                >#{{ formatNumber(hovered.index + 1) }}</span
              >
              <strong>No registry data</strong>
            </div>
            <p class="tooltip-author">
              The crawler could not read this package's latest version.
            </p>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
