import { parseManifest } from '../shared/model.ts'

// registry.npmjs.org sends CORS headers, so the browser can query it directly.
const REGISTRY = 'https://registry.npmjs.org'

export interface Manifest {
  version: string
  author: string | null
  provenance: boolean
  oidc: boolean
  staged: boolean
  // npm username of the maintainer who approved the staged release.
  approver: string | null
}

export function latestManifestUrl(name: string): string {
  return `${REGISTRY}/${name.replace('/', '%2f')}/latest`
}

export function readManifest(manifest: any): Manifest {
  const [version, author, provenance, oidc, staged] = parseManifest(manifest)
  return {
    version,
    author,
    provenance,
    oidc,
    staged,
    approver: manifest._npmUser?.approver?.name ?? null,
  }
}
