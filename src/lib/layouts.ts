/**
 * Manga page layout presets.
 *
 * These are the compositions that actually recur in published manga, not
 * arbitrary grids. Panels are expressed in 0-1 fractions of the inner frame,
 * so a preset works at any page size.
 *
 * Panel *order* matters: manga reads right-to-left, top-to-bottom, so within
 * each tier the rightmost panel comes first. The order below is reading order,
 * which is what the layers list and any future page-flow tooling should follow.
 */

import { PRINT, createId, type Panel } from './types'

type Cell = [number, number, number, number]

export interface Layout {
  id: string
  name: string
  /** What this composition is actually for, in a reader's terms. */
  note: string
  /** Panels as [x, y, w, h] in 0-1 inner-frame space, in reading order. */
  cells: Cell[]
}

const gx = PRINT.gutterX
const gy = PRINT.gutterY

/** Split a span into n equal parts separated by a gutter. */
function split(n: number, gutter: number): [number, number][] {
  const size = (1 - gutter * (n - 1)) / n
  return Array.from({ length: n }, (_, i) => [i * (size + gutter), size])
}

/** Rows of equal height, each divided into equal columns (right-to-left order). */
function grid(rowCols: number[]): Cell[] {
  const rows = split(rowCols.length, gy)
  const cells: Cell[] = []

  rowCols.forEach((cols, r) => {
    const row = rows[r]!
    const columns = split(cols, gx)
    // Reversed: manga reads right to left.
    for (let c = cols - 1; c >= 0; c--) {
      const col = columns[c]!
      cells.push([col[0], row[0], col[1], row[1]])
    }
  })

  return cells
}

/** A row of n panels spanning a given vertical band, right-to-left. */
function row(y: number, h: number, n: number): Cell[] {
  const cols = split(n, gx)
  const out: Cell[] = []
  for (let c = n - 1; c >= 0; c--) {
    const col = cols[c]!
    out.push([col[0], y, col[1], h])
  }
  return out
}

/** Split a band into n columns at explicit proportions, right-to-left. */
function cols(y: number, h: number, widths: number[]): Cell[] {
  const total = widths.reduce((a, b) => a + b, 0)
  const usable = 1 - gx * (widths.length - 1)
  const sizes = widths.map((w) => (w / total) * usable)
  const xs: number[] = []
  let x = 0
  for (const size of sizes) {
    xs.push(x)
    x += size + gx
  }
  return widths
    .map((_, i) => [xs[i]!, y, sizes[i]!, h] as Cell)
    .reverse()
}

/** Vertical bands at explicit proportions, top to bottom. */
function bands(heights: number[]): { y: number; h: number }[] {
  const total = heights.reduce((a, b) => a + b, 0)
  const usable = 1 - gy * (heights.length - 1)
  const sizes = heights.map((h) => (h / total) * usable)
  const out: { y: number; h: number }[] = []
  let y = 0
  for (const size of sizes) {
    out.push({ y, h: size })
    y += size + gy
  }
  return out
}

export const LAYOUTS: Layout[] = [
  {
    id: 'four-tier',
    name: 'Four tier',
    note: 'The workhorse. Steady, even pacing for dialogue.',
    cells: grid([1, 1, 1, 1]),
  },
  {
    id: 'classic',
    name: 'Classic manga',
    note: 'Wide establishing shot, then three beats underneath.',
    cells: grid([1, 3, 2]),
  },
  {
    id: 'hero',
    name: 'Hero shot',
    note: 'One big moment on top, reactions below.',
    cells: (() => {
      const rows = split(3, gy)
      const top = rows[0]!
      const mid = rows[1]!
      const bot = rows[2]!
      const bigH = top[1] + gy + mid[1]
      const cols = split(2, gx)
      return [
        [0, top[0], 1, bigH],
        [cols[1]![0], bot[0], cols[1]![1], bot[1]],
        [cols[0]![0], bot[0], cols[0]![1], bot[1]],
      ] as [number, number, number, number][]
    })(),
  },
  {
    id: 'action-reaction',
    name: 'Action / reaction',
    note: 'Two setups, then a wide panel to land the payoff.',
    cells: grid([2, 2, 1]),
  },
  {
    id: 'three-tier',
    name: 'Three tier',
    note: 'Slower, more cinematic. Room to breathe.',
    cells: grid([1, 1, 1]),
  },
  {
    id: 'six-grid',
    name: 'Six grid',
    note: 'Dense and rhythmic — rapid exchanges.',
    cells: grid([2, 2, 2]),
  },
  {
    id: 'splash',
    name: 'Splash',
    note: 'One full-frame image. Chapter openers and big reveals.',
    cells: [[0, 0, 1, 1]],
  },
  {
    id: 'vertical-thirds',
    name: 'Vertical thirds',
    note: 'Three tall panels. Standoffs and character line-ups.',
    cells: (() => {
      const cols = split(3, gx)
      return [2, 1, 0].map((c) => {
        const col = cols[c]!
        return [col[0], 0, col[1], 1]
      }) as [number, number, number, number][]
    })(),
  },
  {
    id: 'stagger',
    name: 'Staggered',
    note: 'An off-kilter tier to break the rhythm and add tension.',
    cells: (() => {
      const rows = split(3, gy)
      const r0 = rows[0]!
      const r1 = rows[1]!
      const r2 = rows[2]!
      const wide = 0.62
      const narrow = 1 - wide - gx
      return [
        [0, r0[0], 1, r0[1]],
        [narrow + gx, r1[0], wide, r1[1]],
        [0, r1[0], narrow, r1[1]],
        [wide + gx, r2[0], narrow, r2[1]],
        [0, r2[0], wide, r2[1]],
      ] as Cell[]
    })(),
  },
  {
    id: 'establishing',
    name: 'Establishing',
    note: 'Tall scene-setter up top, then the scene plays out.',
    cells: (() => {
      const b = bands([1.5, 1, 1])
      return [
        ...row(b[0]!.y, b[0]!.h, 1),
        ...row(b[1]!.y, b[1]!.h, 2),
        ...row(b[2]!.y, b[2]!.h, 3),
      ]
    })(),
  },
  {
    id: 'closing-in',
    name: 'Closing in',
    note: 'Panels narrow as you descend — tightening focus.',
    cells: (() => {
      const b = bands([1, 1, 1])
      return [
        ...row(b[0]!.y, b[0]!.h, 1),
        ...row(b[1]!.y, b[1]!.h, 2),
        ...row(b[2]!.y, b[2]!.h, 4),
      ]
    })(),
  },
  {
    id: 'opening-out',
    name: 'Opening out',
    note: 'Quick beats resolving into one wide shot.',
    cells: (() => {
      const b = bands([1, 1, 1.4])
      return [
        ...row(b[0]!.y, b[0]!.h, 3),
        ...row(b[1]!.y, b[1]!.h, 2),
        ...row(b[2]!.y, b[2]!.h, 1),
      ]
    })(),
  },
  {
    id: 'sidebar-right',
    name: 'Standing figure',
    note: 'A full-height panel beside a stack — a character watching.',
    cells: (() => {
      const usable = 1 - gx
      const tall = usable * 0.36
      const rest = usable * 0.64
      const b = bands([1, 1, 1])
      return [
        [rest + gx, 0, tall, 1],
        ...b.map(({ y, h }) => [0, y, rest, h] as Cell),
      ]
    })(),
  },
  {
    id: 'sidebar-left',
    name: 'Standing figure, left',
    note: 'The mirror of the above, for the opposite page.',
    cells: (() => {
      const usable = 1 - gx
      const tall = usable * 0.36
      const rest = usable * 0.64
      const b = bands([1, 1, 1])
      return [
        ...b.map(({ y, h }) => [tall + gx, y, rest, h] as Cell),
        [0, 0, tall, 1],
      ]
    })(),
  },
  {
    id: 'inset',
    name: 'Splash with insets',
    note: 'A big image with two small cut-ins along the bottom.',
    cells: (() => {
      const b = bands([2.6, 1])
      return [
        ...row(b[0]!.y, b[0]!.h, 1),
        ...row(b[1]!.y, b[1]!.h, 3),
      ]
    })(),
  },
  {
    id: 'two-tier',
    name: 'Two tier',
    note: 'Two wide panels. Slow, weighty beats.',
    cells: grid([1, 1]),
  },
  {
    id: 'nine-grid',
    name: 'Nine grid',
    note: 'Rapid-fire. Montage, comedy timing, quick cuts.',
    cells: grid([3, 3, 3]),
  },
  {
    id: 'uneven-thirds',
    name: 'Uneven thirds',
    note: 'A wide panel paired with a narrow one, alternating sides.',
    cells: (() => {
      const b = bands([1, 1, 1])
      return [
        ...cols(b[0]!.y, b[0]!.h, [2, 1]),
        ...cols(b[1]!.y, b[1]!.h, [1, 2]),
        ...cols(b[2]!.y, b[2]!.h, [2, 1]),
      ]
    })(),
  },
  {
    id: 'confrontation',
    name: 'Confrontation',
    note: 'Two facing panels over a wide reaction. Arguments and duels.',
    cells: (() => {
      const b = bands([1.3, 1, 1])
      return [
        ...row(b[0]!.y, b[0]!.h, 2),
        ...row(b[1]!.y, b[1]!.h, 1),
        ...row(b[2]!.y, b[2]!.h, 2),
      ]
    })(),
  },
  {
    id: 'title-page',
    name: 'Title page',
    note: 'A band for the chapter title over a large opening image.',
    cells: (() => {
      const b = bands([1, 3.4])
      return [
        ...row(b[0]!.y, b[0]!.h, 1),
        ...row(b[1]!.y, b[1]!.h, 1),
      ]
    })(),
  },
  {
    id: 'four-stack',
    name: 'Four stack',
    note: 'Four wide bands. Rhythm, repetition, a passing moment.',
    cells: (() => {
      const b = bands([1, 1, 1, 1])
      return b.flatMap(({ y, h }) => row(y, h, 1))
    })(),
  },
  {
    id: 'pyramid',
    name: 'Pyramid',
    note: 'Three, then two, then one. Converging on a conclusion.',
    cells: (() => {
      const b = bands([1, 1.1, 1.3])
      return [
        ...row(b[0]!.y, b[0]!.h, 3),
        ...row(b[1]!.y, b[1]!.h, 2),
        ...row(b[2]!.y, b[2]!.h, 1),
      ]
    })(),
  },
]

export function panelsFromLayout(layout: Layout): Panel[] {
  return layout.cells.map(([x, y, w, h]) => ({ id: createId(), x, y, w, h }))
}
