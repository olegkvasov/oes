import type { Change, Decision, Point, Snapshot, Vehicle } from './model';

/** Owns the last contiguous server state. Publication is batched by the container. */
export class Synchronization {
  private vehicles = new Map<string, Vehicle>();
  private points = new Map<string, Point>();
  private decisions = new Map<string, Decision>();
  seq = 0;
  at = '';

  reset(snapshot: Snapshot, confirmedDuringLoad: (Point | Decision)[] = []) {
    this.seq = snapshot.seq;
    this.at = snapshot.at;
    this.vehicles = new Map(snapshot.vehicles.map((v) => [v.vehicle_id, v]));
    this.points = new Map(snapshot.points.map((p) => [p.point_id, p]));
    this.decisions = new Map(snapshot.decisions.map((d) => [d.decision_id, d]));
    for (const object of confirmedDuringLoad) this.accept(object);
  }

  accept(object: Point | Decision) {
    if ('decision_id' in object) {
      const previous = this.decisions.get(object.decision_id);
      if (!previous || object.version >= previous.version)
        this.decisions.set(object.decision_id, object);
    } else {
      const previous = this.points.get(object.point_id);
      if (!previous || object.version >= previous.version) this.points.set(object.point_id, object);
    }
  }

  apply(event: Change): 'ignore' | 'apply' | 'recover' {
    if (event.seq <= this.seq) return 'ignore';
    if (event.seq !== this.seq + 1) return 'recover';
    if (event.type === 'vehicle') this.vehicles.set(event.data.vehicle_id, event.data);
    else this.accept(event.data);
    this.seq = event.seq;
    this.at = event.at;
    return 'apply';
  }

  snapshot(now: number): Snapshot {
    for (const [id, decision] of this.decisions) {
      if (Date.parse(decision.created_at) < now - 3600000) this.decisions.delete(id);
    }
    return {
      seq: this.seq,
      at: this.at,
      vehicles: [...this.vehicles.values()],
      points: [...this.points.values()],
      decisions: [...this.decisions.values()].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    };
  }
}
