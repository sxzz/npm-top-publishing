import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { GlobalFonts, type SvgCanvas } from '@napi-rs/canvas'
export {
  classifyResults,
  COLORS,
  COMBO_SERIES,
  createDailyStatEntry,
  getListUpdateIndices,
  getMetricSeries,
  getNullableMetricSeries,
  INDEPENDENT_SERIES,
  metric,
  type Classified,
  type DailyStat,
  type MetricKey,
  type MetricSeriesSpec,
  type Result,
  type Results,
} from '../shared/model.ts'

export function registerInterFont(): void {
  GlobalFonts.registerFromPath(
    path.resolve(import.meta.dirname, '../fonts/Inter-Regular.ttf'),
    'Inter',
  )
}

export async function writeChartSvg(
  canvas: SvgCanvas,
  filename: string,
): Promise<void> {
  await writeFile(filename, canvas.getContent())
  console.log(`${filename} updated successfully`)
}
