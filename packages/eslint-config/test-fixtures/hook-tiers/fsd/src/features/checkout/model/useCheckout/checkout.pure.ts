export function totalAfterCoupon(total: number, code: string): number {
  return code === 'VIP' ? Math.round(total * 0.9) : total
}
