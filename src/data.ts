import dailyStatsData from '../daily-stats.json' with { type: 'json' }
import fullResultsData from '../full-results.json' with { type: 'json' }
import type { DailyStat, Results } from '../shared/model.ts'

export const stats = dailyStatsData as DailyStat[]
export const results = fullResultsData as unknown as Results

// Mutually exclusive states for one package, ordered from least to most
// protected. Staged publishing only counts toward `full` here; it is still
// filterable on its own through `CHECKS`.
export type PackageState = 'none' | 'provenance' | 'oidc' | 'trusted' | 'full'

export interface PackageRow {
  rank: number
  name: string
  version: string
  author: string | null
  provenance: boolean
  oidc: boolean
  staged: boolean
  state: PackageState
}

export interface StateSpec {
  key: PackageState
  label: string
  description: string
  color: string
}

// UI palette only. The README charts keep using `COLORS` from shared/model.ts.
export const STATES: StateSpec[] = [
  {
    key: 'full',
    label: 'Full chain',
    description: 'OIDC, provenance and staged publishing',
    color: '#141f8c',
  },
  {
    key: 'trusted',
    label: 'OIDC + provenance',
    description: 'Not staged',
    color: '#3b4fe0',
  },
  {
    key: 'oidc',
    label: 'OIDC only',
    description: 'Provenance turned off',
    color: '#7c8ff0',
  },
  {
    key: 'provenance',
    label: 'Provenance only',
    description: 'Published with a token',
    color: '#adb9ee',
  },
  {
    key: 'none',
    label: 'Neither',
    description: 'Token, no attestation',
    color: '#c9ced8',
  },
]

export const STATE_BY_KEY = Object.fromEntries(
  STATES.map((state) => [state.key, state]),
) as Record<PackageState, StateSpec>

export type CheckKey = 'oidc' | 'provenance' | 'staged'

export const CHECKS: { key: CheckKey; label: string; description: string }[] = [
  {
    key: 'oidc',
    label: 'OIDC',
    description:
      'Published from CI through trusted publishing, with no long-lived token.',
  },
  {
    key: 'provenance',
    label: 'Provenance',
    description:
      'Ships a signed attestation linking the tarball to its source commit and build.',
  },
  {
    key: 'staged',
    label: 'Staged',
    description:
      'Held as a staged release until a maintainer approved it on npm.',
  },
]

function stateOf(oidc: boolean, provenance: boolean, staged: boolean) {
  if (oidc && provenance) return staged ? 'full' : 'trusted'
  if (oidc) return 'oidc'
  if (provenance) return 'provenance'
  return 'none'
}

// `null` entries are packages the crawler could not resolve. They keep their
// rank slot so the grid still lines up with the upstream list.
export const rows: (PackageRow | null)[] = Object.entries(results).map(
  ([name, result], index) => {
    if (!result) return null
    const [version, author, provenance, oidc, staged] = result
    return {
      rank: index + 1,
      name,
      version,
      author,
      provenance,
      oidc,
      staged,
      state: stateOf(oidc, provenance, staged),
    }
  },
)

export const packages = rows.filter((row) => row !== null)

export function countState(stat: DailyStat, key: PackageState): number {
  switch (key) {
    case 'full':
      return stat.oidcProvenanceStaged ?? 0
    case 'trusted':
      return (stat.oidcAndProvenance ?? 0) - (stat.oidcProvenanceStaged ?? 0)
    case 'oidc':
      return stat.oidcWithoutProvenance ?? 0
    case 'provenance':
      return stat.provenanceOnly ?? 0
    case 'none':
      return stat.none ?? 0
  }
}

// Series for the "each check" trend view. OIDC is dashed because its history
// predates the other fields and uses a slightly different definition.
export const TREND_CHECKS = [
  { key: 'staged', label: 'Staged', color: '#3b4fe0', dash: [] },
  { key: 'provenance', label: 'Provenance', color: '#7c8ff0', dash: [] },
  { key: 'oidc', label: 'OIDC', color: '#5b6273', dash: [5, 3] },
  {
    key: 'oidcProvenanceStaged',
    label: 'Full chain',
    color: '#141f8c',
    dash: [],
  },
] as const
