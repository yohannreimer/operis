import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { LandingPage } from './landing-page';

describe('LandingPage — Operis', () => {
  test('renders Operis headline', () => {
    render(<LandingPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/o dia que você/i);
  });

  test('renders CTA link to sign-in', () => {
    render(<LandingPage />);
    const ctaLinks = screen.getAllByRole('link', { name: /criar conta grátis/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    ctaLinks.forEach(link => expect(link).toHaveAttribute('href', '/sign-in'));
  });

  test('renders three feature items', () => {
    render(<LandingPage />);
    expect(screen.getByText(/objetivos estratégicos/i)).toBeInTheDocument();
    expect(screen.getByText(/execução diária/i)).toBeInTheDocument();
    expect(screen.getByText(/revisão semanal/i)).toBeInTheDocument();
  });

  test('renders problem headline', () => {
    render(<LandingPage />);
    expect(screen.getByText(/você é capaz/i)).toBeInTheDocument();
  });
});
