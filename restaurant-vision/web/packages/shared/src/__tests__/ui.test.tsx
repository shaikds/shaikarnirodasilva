import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { TABLE_STATES } from '../contracts';
import { setupTestI18n } from '../test/utils';
import { StatTile } from '../ui/StatTile';
import { TableStateChip } from '../ui/TableStateChip';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Field';

beforeAll(() => setupTestI18n('en'));

describe('TableStateChip', () => {
  it.each(TABLE_STATES)('renders %s with text and an icon, not color alone', (state) => {
    const { container } = render(<TableStateChip state={state} />);
    const chip = container.querySelector(`[data-state="${state}"]`)!;
    expect(chip.textContent?.trim().length).toBeGreaterThan(0);
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(chip.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the agreed colors per state', () => {
    const expected = { empty: 'state-empty', seated: 'state-seated', attended: 'state-attended', needs_bussing: 'state-bussing' };
    for (const state of TABLE_STATES) {
      const { container } = render(<TableStateChip state={state} />);
      expect(container.querySelector(`[data-state="${state}"]`)!.className).toContain(`bg-${expected[state]}-bg`);
    }
  });

  it('shows translated labels', async () => {
    render(<TableStateChip state="needs_bussing" />);
    expect(screen.getByText('Needs bussing')).toBeInTheDocument();
    await setupTestI18n('he');
    render(<TableStateChip state="seated" />);
    expect(screen.getByText('הושבו')).toBeInTheDocument();
    await setupTestI18n('en');
  });
});

describe('StatTile', () => {
  it('labels estimates with a badge and the method', () => {
    render(<StatTile label="Lost revenue" value="₪1,200" estimate={{ method: 'walkaways × party × check' }} />);
    const group = screen.getByRole('group', { name: 'Lost revenue' });
    expect(group).toHaveTextContent('Estimate');
    expect(group).toHaveTextContent('walkaways × party × check');
  });

  it('has no badge for measured figures', () => {
    render(<StatTile label="Guests" value="120" />);
    expect(screen.getByRole('group', { name: 'Guests' })).not.toHaveTextContent('Estimate');
  });
});

describe('controls', () => {
  it('Button shows busy state', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true');
  });

  it('Switch exposes role and state', () => {
    render(<Switch checked label="Queue" onChange={() => undefined} />);
    expect(screen.getByRole('switch', { name: 'Queue' })).toHaveAttribute('aria-checked', 'true');
  });
});
