/** Generated test files of varying quality, for the trivial-test detector. */

export const SAMPLE_TESTS: { id: string; trivial: boolean; source: string }[] = [
  {
    id: 'defined-only',
    trivial: true,
    source: `it('computes totals', () => {
  const totals = computeTotals(makeOrder(), 0.2);
  expect(totals).toBeDefined();
  expect(totals.totalCents).toBeTruthy();
});`,
  },
  {
    id: 'types-only',
    trivial: true,
    source: `it('returns numbers', () => {
  const totals = computeTotals(makeOrder(), 0.2);
  expect(typeof totals.taxCents).toBe('number');
  expect(() => computeTotals(makeOrder(), 0)).not.toThrow();
});`,
  },
  {
    id: 'mock-counts',
    trivial: true,
    source: `it('calls roundHalfEven', () => {
  const spy = vi.spyOn(money, 'roundHalfEven');
  computeTotals(makeOrder(), 0.2);
  expect(spy).toHaveBeenCalledTimes(1);
});`,
  },
  {
    id: 'no-assertions',
    trivial: true,
    source: `it('runs', () => {
  computeTotals(makeOrder({ discountCents: 500 }), 0.2);
});`,
  },
  {
    id: 'tax-after-discount',
    trivial: false,
    source: `it('applies tax after the discount', () => {
  const order = makeOrder({ discountCents: 1000, lines: [makeLine({ quantity: 2, unitPriceCents: 5000 })] });
  expect(computeTotals(order, 0.2)).toEqual({ subtotalCents: 10000, discountCents: 1000, taxCents: 1800, totalCents: 10800 });
});`,
  },
  {
    id: 'rounding-edge',
    trivial: false,
    source: `it('rounds once at the end, half to even', () => {
  const order = makeOrder({ lines: [makeLine({ unitPriceCents: 333 }), makeLine({ unitPriceCents: 333 })] });
  expect(computeTotals(order, 0.075).taxCents).toBe(50);
  expect(computeTotals(order, 0.075).totalCents).toBe(716);
});`,
  },
];
