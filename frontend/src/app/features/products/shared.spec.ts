import { FormControl } from '@angular/forms';
import { msg } from '../../core/i18n/i18n.service';
import { actorLabel, addDays, addMonths, duplicateSerials, moneyValidator, parseSerials, previewSchedule, toCents } from './shared';

describe('previewSchedule', () => {
  it('splits the balance evenly and puts the rounding into the last installment', () => {
    const schedule = previewSchedule(10_000_000, 3, 'MONTHLY', '2026-01-31');
    expect(schedule.map(e => e.amountCents)).toEqual([3_333_333, 3_333_333, 3_333_334]);
    expect(schedule.map(e => e.number)).toEqual([1, 2, 3]);
  });

  it('spaces monthly installments by calendar month, clamping to the month end', () => {
    expect(previewSchedule(300, 3, 'MONTHLY', '2026-01-31').map(e => e.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('spaces weekly and custom installments by days', () => {
    expect(previewSchedule(200, 2, 'WEEKLY', '2026-11-11').map(e => e.dueDate)).toEqual(['2026-11-11', '2026-11-18']);
    expect(previewSchedule(200, 2, 'CUSTOM', '2026-11-11', 10).map(e => e.dueDate)).toEqual(['2026-11-11', '2026-11-21']);
  });

  it('is empty when there is nothing to finance or no installments', () => {
    expect(previewSchedule(0, 3, 'MONTHLY', '2026-01-01')).toEqual([]);
    expect(previewSchedule(1000, 0, 'MONTHLY', '2026-01-01')).toEqual([]);
  });
});

describe('calendar dates', () => {
  it('addDays crosses month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('addMonths keeps the day when possible and clamps otherwise', () => {
    expect(addMonths('2026-11-15', 1)).toBe('2026-12-15');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });
});

describe('serial numbers', () => {
  it('parseSerials takes one per line, trimmed, ignoring blank lines', () => {
    expect(parseSerials(' SN-1 \r\n\n  SN-2\nSN-3 ')).toEqual(['SN-1', 'SN-2', 'SN-3']);
  });

  it('duplicateSerials ignores case and spaces, like the server', () => {
    expect(duplicateSerials(['SN-1', 'sn-1', 'S N-2', 'SN-2', 'SN-3'])).toEqual(['sn-1', 'SN-2']);
    expect(duplicateSerials(['A', 'B'])).toEqual([]);
  });
});

describe('money', () => {
  const valid = (value: unknown, options?: { allowZero: boolean }) => moneyValidator(options)(new FormControl(value)) === null;

  it('accepts rupees with at most two decimals', () => {
    expect(valid(120000)).toBeTrue();
    expect(valid('33333.33')).toBeTrue();
    expect(valid(0)).toBeTrue();
    expect(valid('')).toBeTrue(); // "required" is a separate validator
  });

  it('rejects negatives, more than two decimals and non-numbers', () => {
    expect(valid(-1)).toBeFalse();
    expect(valid(12.345)).toBeFalse();
    expect(valid('abc')).toBeFalse();
  });

  it('can refuse zero', () => {
    expect(valid(0, { allowZero: false })).toBeFalse();
    expect(valid(0.01, { allowZero: false })).toBeTrue();
  });

  it('toCents avoids floating point drift', () => {
    expect(toCents(33333.33)).toBe(3_333_333);
    expect(toCents('0.1')).toBe(10);
    expect(toCents('')).toBe(0);
  });
});

describe('actorLabel', () => {
  it('names the owner, and employees with their ID', () => {
    expect(actorLabel({ type: 'owner', id: '1', name: 'Tina', employeeId: '' })).toBe('Shop owner');
    expect(actorLabel({ type: 'employee', id: '2', name: 'Eve', employeeId: 'EMP-0001' })).toEqual(msg('{name} ({id})', { name: 'Eve', id: 'EMP-0001' }));
    expect(actorLabel(undefined)).toBe('');
  });
});
