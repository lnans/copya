import { describe, expect, it } from "vitest"

import { assignAnnotationLanes } from "./annotation-lanes"

describe("assignAnnotationLanes", () => {
  const f = (start: number, end: number, name: string) =>
    ({ chrom: "chr1" as const, start, end, name })

  it("stacks overlapping features on separate lanes", () => {
    const { placed, laneCount } = assignAnnotationLanes([
      f(0, 100, "a"),
      f(50, 150, "b"),
      f(200, 300, "c"),
    ])
    expect(laneCount).toBe(2)
    expect(placed.find((p) => p.feature.name === "a")!.lane).toBe(0)
    expect(placed.find((p) => p.feature.name === "b")!.lane).toBe(1)
    expect(placed.find((p) => p.feature.name === "c")!.lane).toBe(0)
  })
})
