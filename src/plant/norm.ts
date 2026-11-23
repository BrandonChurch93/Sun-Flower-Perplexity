// The length of a vector. `Math.hypot` guards against overflow no length here can reach, at many times the cost.
export function norm(x: number, y: number, z = 0): number {
  return Math.sqrt(x * x + y * y + z * z)
}
