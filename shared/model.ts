export type Result =
  | [
      version: string,
      author: string | null,
      provenance: boolean,
      oidc: boolean,
      staged: boolean,
    ]
  | null

export interface Results {
  [name: string]: Result
}

export type MetricKey =
  | 'oidc'
  | 'provenance'
  | 'staged'
  | 'oidcAndProvenance'
  | 'oidcWithoutProvenance'
  | 'provenanceOnly'
  | 'none'
  | 'oidcProvenanceStaged'

export const COLORS = {
  // Combo buckets (mutually exclusive)
  oidcAndProvenance: '#59a14f',
  oidcWithoutProvenance: '#edc949',
  provenanceOnly: '#f28e2c',
  none: '#e15759',
  // Independent metrics
  oidc: '#76b7b2',
  provenance: '#b07aa1',
  staged: '#4e79a7',
  oidcProvenanceStaged: '#9c755f',
  // Misc
  nonStaged: '#cecece',
  marker: '#888',
} as const

export interface MetricSeriesSpec {
  key: MetricKey
  label: string
  color: string
}

export const COMBO_SERIES = [
  {
    key: 'oidcAndProvenance',
    label: 'OIDC + Provenance',
    color: COLORS.oidcAndProvenance,
  },
  {
    key: 'oidcWithoutProvenance',
    label: 'OIDC Without Provenance',
    color: COLORS.oidcWithoutProvenance,
  },
  {
    key: 'provenanceOnly',
    label: 'Provenance Only',
    color: COLORS.provenanceOnly,
  },
  {
    key: 'none',
    label: 'No Publishing Signal',
    color: COLORS.none,
  },
] satisfies MetricSeriesSpec[]

export const INDEPENDENT_SERIES = [
  {
    key: 'oidc',
    label: 'OIDC',
    color: COLORS.oidc,
  },
  {
    key: 'provenance',
    label: 'Provenance',
    color: COLORS.provenance,
  },
  {
    key: 'staged',
    label: 'Staged Publishing',
    color: COLORS.staged,
  },
  {
    key: 'oidcProvenanceStaged',
    label: 'Full Security Chain',
    color: COLORS.oidcProvenanceStaged,
  },
] satisfies MetricSeriesSpec[]

export interface DailyStat {
  date: string
  sha?: string
  listSize: number
  total: number
  // Combo buckets (mutually exclusive, sum to total)
  oidcAndProvenance?: number
  oidcWithoutProvenance?: number
  provenanceOnly?: number
  none?: number
  // Independent metrics
  oidc?: number
  provenance?: number
  staged?: number
  oidcProvenanceStaged?: number
}

export interface Classified {
  // Combo buckets (mutually exclusive, sum to count)
  oidcAndProvenance: string[]
  oidcWithoutProvenance: string[]
  provenanceOnly: string[]
  none: string[]
  // Independent / overlapping metrics
  oidc: string[]
  provenance: string[]
  staged: string[]
  oidcProvenanceStaged: string[]
  count: number
}

export function classifyResults(results: Results): Classified {
  const oidcAndProvenance: string[] = []
  const oidcWithoutProvenance: string[] = []
  const provenanceOnly: string[] = []
  const none: string[] = []
  const oidc: string[] = []
  const provenance: string[] = []
  const staged: string[] = []
  const oidcProvenanceStaged: string[] = []
  for (const [name, result] of Object.entries(results)) {
    if (!result) continue
    const [, , hasProvenance, hasOidc, isStaged] = result
    if (hasOidc && hasProvenance) {
      oidcAndProvenance.push(name)
    } else if (hasOidc) {
      oidcWithoutProvenance.push(name)
    } else if (hasProvenance) {
      provenanceOnly.push(name)
    } else {
      none.push(name)
    }
    if (hasOidc) oidc.push(name)
    if (hasProvenance) provenance.push(name)
    if (isStaged) staged.push(name)
    if (hasOidc && hasProvenance && isStaged) oidcProvenanceStaged.push(name)
  }
  return {
    oidcAndProvenance,
    oidcWithoutProvenance,
    provenanceOnly,
    none,
    oidc,
    provenance,
    staged,
    oidcProvenanceStaged,
    count:
      oidcAndProvenance.length +
      oidcWithoutProvenance.length +
      provenanceOnly.length +
      none.length,
  }
}

export function metric(stat: DailyStat, key: MetricKey): number {
  switch (key) {
    case 'oidc':
      return (
        stat.oidc ??
        (stat.oidcAndProvenance ?? 0) + (stat.oidcWithoutProvenance ?? 0)
      )
    case 'provenance':
      return (
        stat.provenance ??
        (stat.oidcAndProvenance ?? 0) + (stat.provenanceOnly ?? 0)
      )
    case 'staged':
      return stat.staged ?? 0
    case 'oidcAndProvenance':
      return stat.oidcAndProvenance ?? 0
    case 'oidcWithoutProvenance':
      return stat.oidcWithoutProvenance ?? 0
    case 'provenanceOnly':
      return stat.provenanceOnly ?? 0
    case 'none':
      return stat.none ?? 0
    case 'oidcProvenanceStaged':
      return stat.oidcProvenanceStaged ?? 0
  }
}

export function getMetricSeries(stats: DailyStat[], key: MetricKey): number[] {
  return stats.map((item) => metric(item, key))
}

export function getNullableMetricSeries(
  stats: DailyStat[],
  key: MetricKey,
): (number | null)[] {
  return stats.map((item) => {
    const value = item[key]
    return value == null ? null : metric(item, key)
  })
}

export function getListUpdateIndices(stats: DailyStat[]): Set<number> {
  const indices = new Set<number>()
  for (let i = 1; i < stats.length; i++) {
    if (stats[i].listSize !== stats[i - 1].listSize) {
      indices.add(i)
    }
  }
  return indices
}

export function createDailyStatEntry(
  results: Results,
  date: string,
  sha: string,
): DailyStat {
  const classified = classifyResults(results)
  return {
    date,
    sha,
    listSize: Object.keys(results).length,
    total: classified.count,
    oidcAndProvenance: classified.oidcAndProvenance.length,
    oidcWithoutProvenance: classified.oidcWithoutProvenance.length,
    provenanceOnly: classified.provenanceOnly.length,
    none: classified.none.length,
    oidc: classified.oidc.length,
    provenance: classified.provenance.length,
    staged: classified.staged.length,
    oidcProvenanceStaged: classified.oidcProvenanceStaged.length,
  }
}
