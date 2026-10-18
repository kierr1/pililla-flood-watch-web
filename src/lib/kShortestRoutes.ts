import { distanceKm } from "@/data/pililla";

export type LngLat = [number, number];
export type RoadRoute = { coords: LngLat[]; distance: number; duration: number };
type Edge = { to: number; meters: number };
type Vertex = { point: LngLat; edges: Edge[] };
type Path = { nodes: number[]; meters: number };
const ROAD_TYPES = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link";

function key(a: number, b: number) { return a + ":" + b; }
function nearest(graph: Vertex[], point: LngLat) {
  let id = -1, meters = Infinity;
  graph.forEach((v, i) => {
    const d = distanceKm(v.point, point) * 1000;
    if (d < meters) { meters = d; id = i; }
  });
  if (id < 0 || meters > 150) throw Error("GPS or shelter is over 150 m from a mapped drivable road.");
  return id;
}
function dijkstra(graph: Vertex[], source: number, dest: number, blockedNodes = new Set<number>(), blockedEdges = new Set<string>()): Path | null {
  if (blockedNodes.has(source) || blockedNodes.has(dest)) return null;
  const dist = new Float64Array(graph.length).fill(Infinity);
  const prev = new Int32Array(graph.length).fill(-1);
  const heap: [number, number][] = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= item[0]) break; heap[i] = heap[p]; i = p; }
    heap[i] = item;
  };
  const pop = (): [number, number] | undefined => {
    if (!heap.length) return undefined;
    const first = heap[0], last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (2 * i + 1 < heap.length) {
        let c = 2 * i + 1;
        if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++;
        if (heap[c][0] >= last[0]) break;
        heap[i] = heap[c]; i = c;
      }
      heap[i] = last;
    }
    return first;
  };
  dist[source] = 0; push([0, source]);
  while (heap.length) {
    const [cost, u] = pop()!;
    if (cost !== dist[u]) continue;
    if (u === dest) {
      const nodes: number[] = [];
      let at = u;
      while (at !== -1) { nodes.push(at); at = prev[at]; }
      return { nodes: nodes.reverse(), meters: cost };
    }
    for (const e of graph[u].edges) {
      if (blockedNodes.has(e.to) || blockedEdges.has(key(u, e.to))) continue;
      const next = cost + e.meters;
      if (next < dist[e.to]) { dist[e.to] = next; prev[e.to] = u; push([next, e.to]); }
    }
  }
  return null;
}
function pathDistance(graph: Vertex[], nodes: number[]) {
  let length = 0;
  for (let i = 1; i < nodes.length; i++) {
    const e = graph[nodes[i - 1]].edges.find(e => e.to === nodes[i]);
    if (!e) return Infinity;
    length += e.meters;
  }
  return length;
}
/** Yen's algorithm: K shortest loopless paths in a *directed road graph*. */
function yen(graph: Vertex[], start: number, end: number, k: number): Path[] {
  const first = dijkstra(graph, start, end);
  if (!first) return [];
  const accepted: Path[] = [first], queue: Path[] = [];
  const seen = new Set([first.nodes.join(",")]);
  for (let nth = 1; nth < k; nth++) {
    const previous = accepted[nth - 1].nodes;
    for (let i = 0; i < previous.length - 1; i++) {
      const root = previous.slice(0, i + 1), spur = root[root.length - 1];
      const blockedNodes = new Set(root.slice(0, -1));
      const blockedEdges = new Set<string>();
      for (const acceptedPath of accepted) {
        if (root.every((n, j) => acceptedPath.nodes[j] === n) && acceptedPath.nodes.length > i + 1)
          blockedEdges.add(key(acceptedPath.nodes[i], acceptedPath.nodes[i + 1]));
      }
      const tail = dijkstra(graph, spur, end, blockedNodes, blockedEdges);
      if (!tail) continue;
      const nodes = root.slice(0, -1).concat(tail.nodes);
      const signature = nodes.join(",");
      if (seen.has(signature)) continue;
      seen.add(signature);
      queue.push({ nodes, meters: pathDistance(graph, nodes) });
    }
    if (!queue.length) break;
    queue.sort((a, b) => a.meters - b.meters);
    accepted.push(queue.shift()!);
  }
  return accepted;
}
type OSMWay = { type: string; id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };
/** Retrieve actual mapped road segments; no straight-line synthetic routing. */
export async function kShortestRoadRoutes(origin: LngLat, destination: LngLat, signal: AbortSignal, count = 3): Promise<RoadRoute[]> {
  const south = Math.min(origin[1], destination[1]) - 0.025;
  const north = Math.max(origin[1], destination[1]) + 0.025;
  const west = Math.min(origin[0], destination[0]) - 0.025;
  const east = Math.max(origin[0], destination[0]) + 0.025;
  // Prevent excessively large public Overpass queries on distant routes.
  if (north - south > 0.16 || east - west > 0.16) throw Error("Road graph is too large for browser K-shortest search.");
  const query = `[out:json][timeout:25];way["highway"~"^(${ROAD_TYPES})$"](${south},${west},${north},${east});out geom;`;
  const response = await fetch("https://overpass.kumi.systems/api/interpreter", {
    method: "POST", body: new URLSearchParams({ data: query }), signal,
  });
  if (!response.ok) throw Error("OpenStreetMap road graph unavailable.");
  const json = await response.json() as { elements?: OSMWay[] };
  const vertices: Vertex[] = [], vertexIndex = new Map<string, number>();
  const getVertex = (p: {lat:number;lon:number}) => {
    const idKey = p.lat.toFixed(7) + "," + p.lon.toFixed(7);
    let id = vertexIndex.get(idKey);
    if (id === undefined) { id = vertices.length; vertexIndex.set(idKey, id); vertices.push({ point: [p.lon, p.lat], edges: [] }); }
    return id;
  };
  for (const way of json.elements ?? []) {
    const geometry = way.geometry;
    if (way.type !== "way" || !geometry || geometry.length < 2) continue;
    if (way.tags?.access === "private" || way.tags?.access === "no" || way.tags?.motor_vehicle === "no" || way.tags?.motorcar === "no") continue;
    const one = way.tags?.oneway === "yes" || way.tags?.oneway === "1" || way.tags?.junction === "roundabout";
    const reverse = way.tags?.oneway === "-1";
    const points = geometry.map(getVertex);
    for (let i = 1; i < points.length; i++) {
      const u = points[i - 1], v = points[i];
      if (u === v) continue;
      const meters = distanceKm(vertices[u].point, vertices[v].point) * 1000;
      if (!Number.isFinite(meters) || meters <= 0 || meters > 1000) continue;
      if (!reverse) vertices[u].edges.push({ to: v, meters });
      if (!one) vertices[v].edges.push({ to: u, meters });
    }
  }
  if (vertices.length < 2 || vertices.length > 40000) throw Error("Road graph size unsupported.");
  const start = nearest(vertices, origin), end = nearest(vertices, destination);
  const found = yen(vertices, start, end, Math.max(1, Math.min(3, count)));
  if (!found.length) throw Error("No connected drivable road path available.");
  // Durations are approximate at 25 km/h, not live traffic ETAs.
  return found.map(path => ({
    coords: path.nodes.map(id => vertices[id].point),
    distance: path.meters,
    duration: path.meters / (25000 / 3600),
  }));
}
