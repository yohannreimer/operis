import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { LandingPage } from './landing-page';

describe('LandingPage — Operis', () => {
  test('renders Operis headline', () => {
    render(<LandingPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/captura tudo/i);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/executa o que/i);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/importa/i);
  });

  test('renders CTA link to sign-in', () => {
    render(<LandingPage />);
    const ctaLinks = screen.getAllByRole('link', { name: /criar conta grátis/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    ctaLinks.forEach(link => expect(link).toHaveAttribute('href', '/sign-in'));
  });

  test('renders three feature items', () => {
    render(<LandingPage />);
    expect(screen.getByText(/captura em segundos/i)).toBeInTheDocument();
    expect(screen.getByText(/frentes com modo expansão/i)).toBeInTheDocument();
    expect(screen.getAllByText(/timer por item/i).length).toBeGreaterThan(0);
  });

  test('renders problem headline', () => {
    render(<LandingPage />);
    expect(screen.getByText(/o problema é fazer/i)).toBeInTheDocument();
  });
});
