import { describe, expect, it } from "vite-plus/test";
import type { TopologyNode } from "./stageTopology";
import { layoutStageTopology } from "./stageTopologyLayout";

function node(id: string, kind: TopologyNode["kind"] = "resource"): TopologyNode {
  return { id, name: id, kind, type: kind };
}

function edge(source: string, target: string) {
  return { id: JSON.stringify([source, target]), source, target, label: "" };
}

describe("layoutStageTopology", () => {
  it("puts the service link between the Workers and gives each Worker's targets a separate bank", () => {
    const nodes = [
      node("Ingest", "worker"),
      node("Reader", "worker"),
      node("Browser"),
      node("RawPages"),
      node("FetchState"),
      node("PageStore"),
      node("SitePages"),
      node("Search"),
    ];
    const edges = [
      edge("Ingest", "Reader"),
      edge("Ingest", "Browser"),
      edge("Ingest", "RawPages"),
      edge("Ingest", "FetchState"),
      edge("Reader", "PageStore"),
      edge("Reader", "SitePages"),
      edge("Reader", "Search"),
    ];
    const wide = layoutStageTopology(nodes, edges, "bindings");
    const compact = layoutStageTopology(nodes, edges, "bindings", true);
    expect(wide.get("Ingest")?.y).toBe(wide.get("Reader")?.y);
    expect(compact.get("Ingest")?.x).toBe(compact.get("Reader")?.x);
    for (const id of ["Browser", "RawPages", "FetchState"]) {
      expect(wide.get(id)?.y).toBeLessThan(wide.get("Ingest")?.y ?? 0);
    }
    for (const id of ["PageStore", "SitePages", "Search"]) {
      expect(wide.get(id)?.y).toBeGreaterThan(wide.get("Reader")?.y ?? Infinity);
    }
    const compactWidth = Math.max(...[...compact.values()].map((p) => p.x)) + 184;
    expect(compactWidth).toBeLessThan(500);
  });

  it("centers a consumer between its inputs and leaves an independent Worker outside their ranks", () => {
    const nodes = ["Project", "Client", "EmailToken", "Site", "Proxy"].map((id) => node(id));
    const inputs = ["Project", "Client", "EmailToken"];
    const positions = layoutStageTopology(
      nodes,
      inputs.map((id) => edge(id, "Site")),
      "dependencies",
    );
    const sourcePoints = inputs.flatMap((id) => positions.get(id) ?? []);
    expect(new Set(sourcePoints.map((p) => p.x)).size).toBe(1);
    expect(positions.get("Site")?.x).toBeGreaterThan(sourcePoints[0].x);
    expect(positions.get("Site")?.y).toBe(
      sourcePoints.reduce((sum, p) => sum + p.y, 0) / sourcePoints.length,
    );
    expect(positions.get("Proxy")?.y).toBeGreaterThan(Math.max(...sourcePoints.map((p) => p.y)));
  });

  it.each(["bindings", "dependencies"] as const)(
    "keeps a stable non-overlapping %s layout for shared targets, cycles and detached nodes",
    (layer) => {
      const nodes = [
        node("first", "worker"),
        node("second", "worker"),
        node("shared"),
        node("detached"),
      ];
      const edges = [
        edge("first", "second"),
        edge("second", "first"),
        edge("second", "second"),
        edge("first", "shared"),
        edge("second", "shared"),
      ];
      for (const narrow of [false, true]) {
        const positions = layoutStageTopology(nodes, edges, layer, narrow);
        expect(positions).toEqual(
          layoutStageTopology([...nodes].reverse(), [...edges].reverse(), layer, narrow),
        );
        expect(positions.size).toBe(nodes.length);
        const points = [...positions.values()];
        points.forEach((a, index) => {
          for (const b of points.slice(index + 1)) {
            expect(Math.abs(a.x - b.x) >= 184 || Math.abs(a.y - b.y) >= 108).toBe(true);
          }
        });
      }
    },
  );
});
