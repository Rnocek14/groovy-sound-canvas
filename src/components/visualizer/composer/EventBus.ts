export type EventName =
  | "beat"
  | "drop"
  | "remix"
  | "skip"
  | "palette-flip"
  | "kaleido-flip"
  | "snap-zoom"
  | "flash"
  | "invert";

type Handler = (data?: unknown) => void;

export class EventBus {
  private map = new Map<EventName, Set<Handler>>();
  on(name: EventName, h: Handler) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name)!.add(h);
    return () => this.map.get(name)?.delete(h);
  }
  emit(name: EventName, data?: unknown) {
    const set = this.map.get(name);
    if (!set) return;
    for (const h of set) h(data);
  }
  clear() { this.map.clear(); }
}
