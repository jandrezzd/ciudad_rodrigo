import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectOption } from '@/shared/types/common';
import { SearchableSelect } from '../SearchableSelect';

describe('SearchableSelect', () => {
  it('renders the selected option label', () => {
    render(
      <SearchableSelect
        options={[{ value: '1', label: 'Cantera Norte' }]}
        value="1"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Cantera Norte')).toBeInTheDocument();
  });

  it('filters options by the typed text', () => {
    render(
      <SearchableSelect
        options={[
          { value: '1', label: 'Cantera Norte' },
          { value: '2', label: 'Cantera Sur' },
        ]}
        value=""
        onChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sur' } });

    expect(screen.getByText('Cantera Sur')).toBeInTheDocument();
    expect(screen.queryByText('Cantera Norte')).not.toBeInTheDocument();
  });

  // Regresión: razonsocial de MaterialProvider y nombre de Cantera dejaron de
  // ser obligatorios en la base (make_provider_fields_optional). Un registro sin
  // llenar llegaba acá con label null y el filtro tumbaba el render de toda la
  // pantalla de reportes, no solo el del selector.
  it('does not crash when an option label is null', () => {
    const options = [
      { value: '1', label: 'Cantera Norte' },
      { value: '2', label: null },
    ] as unknown as SelectOption[];

    render(<SearchableSelect options={options} value="" onChange={vi.fn()} />);

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();

    // El label null no revienta ni cuando se filtra.
    fireEvent.change(input, { target: { value: 'norte' } });
    expect(screen.getByText('Cantera Norte')).toBeInTheDocument();
  });
});
