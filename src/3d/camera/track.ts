import { Vector3 } from 'three';
import type { CameraKey, CameraTrack } from '@/scenes/types';
import { clamp, easing } from '@/utils/math';

export interface CameraSample {
  position: Vector3;
  target: Vector3;
  fov: number;
  roll: number;
}

export function createCameraSample(): CameraSample {
  return { position: new Vector3(), target: new Vector3(), fov: 40, roll: 0 };
}

interface PreparedTrack {
  keys: CameraKey[];
  posTangents: Vector3[];
  targetTangents: Vector3[];
  fovTangents: number[];
  rollTangents: number[];
}

const prepared = new WeakMap<CameraTrack, PreparedTrack>();

/**
 * Tangents are finite differences divided by elapsed key time, so the spline
 * is parameterised by time rather than by key index. Uneven key spacing then
 * still produces a constant-feeling, C1-continuous camera path.
 */
function prepare(track: CameraTrack): PreparedTrack {
  const cached = prepared.get(track);
  if (cached) return cached;

  const keys = [...track.keys].sort((a, b) => a.t - b.t);
  const n = keys.length;
  const pos = keys.map((k) => new Vector3(...k.position));
  const tgt = keys.map((k) => new Vector3(...k.target));
  const fov = keys.map((k) => k.fov ?? 40);
  const roll = keys.map((k) => k.roll ?? 0);

  const tangentVec = (values: Vector3[], i: number) => {
    if (n < 2) return new Vector3();
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dt = keys[b]!.t - keys[a]!.t || 1;
    return values[b]!.clone().sub(values[a]!).divideScalar(dt);
  };
  const tangentNum = (values: number[], i: number) => {
    if (n < 2) return 0;
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dt = keys[b]!.t - keys[a]!.t || 1;
    return (values[b]! - values[a]!) / dt;
  };

  const result: PreparedTrack = {
    keys,
    posTangents: keys.map((_, i) => tangentVec(pos, i)),
    targetTangents: keys.map((_, i) => tangentVec(tgt, i)),
    fovTangents: keys.map((_, i) => tangentNum(fov, i)),
    rollTangents: keys.map((_, i) => tangentNum(roll, i)),
  };
  prepared.set(track, result);
  return result;
}

const _a = new Vector3();
const _b = new Vector3();
const _ma = new Vector3();
const _mb = new Vector3();

function hermiteVec(out: Vector3, p0: Vector3, m0: Vector3, p1: Vector3, m1: Vector3, u: number, d: number) {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  out
    .copy(p0)
    .multiplyScalar(h00)
    .addScaledVector(m0, h10 * d)
    .addScaledVector(p1, h01)
    .addScaledVector(m1, h11 * d);
  return out;
}

function hermiteNum(p0: number, m0: number, p1: number, m1: number, u: number, d: number) {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * d * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * d * m1;
}

export function sampleTrack(track: CameraTrack, time: number, out: CameraSample): CameraSample {
  const { keys, posTangents, targetTangents, fovTangents, rollTangents } = prepare(track);
  const ease = easing[track.ease ?? 'linear'];
  const t = ease(clamp(time));
  const n = keys.length;

  if (n === 0) return out;
  if (n === 1 || t <= keys[0]!.t) {
    const k = keys[0]!;
    out.position.set(...k.position);
    out.target.set(...k.target);
    out.fov = k.fov ?? 40;
    out.roll = k.roll ?? 0;
    return out;
  }
  const last = keys[n - 1]!;
  if (t >= last.t) {
    out.position.set(...last.position);
    out.target.set(...last.target);
    out.fov = last.fov ?? 40;
    out.roll = last.roll ?? 0;
    return out;
  }

  let i = 0;
  while (i < n - 2 && keys[i + 1]!.t <= t) i++;
  const k0 = keys[i]!;
  const k1 = keys[i + 1]!;
  const d = k1.t - k0.t || 1;
  const u = (t - k0.t) / d;

  hermiteVec(out.position, _a.set(...k0.position), _ma.copy(posTangents[i]!), _b.set(...k1.position), _mb.copy(posTangents[i + 1]!), u, d);
  hermiteVec(out.target, _a.set(...k0.target), _ma.copy(targetTangents[i]!), _b.set(...k1.target), _mb.copy(targetTangents[i + 1]!), u, d);
  out.fov = hermiteNum(k0.fov ?? 40, fovTangents[i]!, k1.fov ?? 40, fovTangents[i + 1]!, u, d);
  out.roll = hermiteNum(k0.roll ?? 0, rollTangents[i]!, k1.roll ?? 0, rollTangents[i + 1]!, u, d);
  return out;
}
