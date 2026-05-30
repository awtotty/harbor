export function equalByJson<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
