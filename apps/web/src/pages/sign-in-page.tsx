// apps/web/src/pages/sign-in-page.tsx
import { SignIn } from '@clerk/clerk-react';
import './sign-in-fonts.css';

function GridGlowDecoration() {
  return (
    <>
      {/* Grid de linhas finas */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), ' +
            'linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      />
      {/* Glow roxo grande — canto inferior direito */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', width: 160, height: 160, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.12), transparent 65%)',
          bottom: -40, right: -30, pointerEvents: 'none',
        }}
      />
      {/* Glow roxo pequeno — centro esquerdo */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', width: 80, height: 80, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.08), transparent 65%)',
          top: '28%', left: '5%', pointerEvents: 'none',
        }}
      />
    </>
  );
}

export function SignInPage() {
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Inter', sans-serif" }}>

      {/* ── Painel esquerdo — Operis ── */}
      <div
        style={{
          width: '42%',
          background: '#060606',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 22px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Prymeira — ícone/marca pequena no topo esquerdo */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <img
            src="/prymeira-selo.png"
            alt="Prymeira"
            style={{ height: 22, opacity: 0.22 }}
          />
        </div>

        <GridGlowDecoration />

        {/* Identidade Operis — canto inferior esquerdo */}
        <div style={{ marginTop: 'auto', position: 'relative', zIndex: 2 }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 38,
              fontWeight: 500,
              color: '#ffffff',
              lineHeight: 1,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Operis
          </div>
          <div
            style={{
              width: 24,
              height: 1,
              background: 'rgba(139,92,246,0.5)',
              marginBottom: 10,
            }}
          />
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 9,
              color: 'rgba(139,92,246,0.5)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              lineHeight: 1.6,
            }}
          >
            Execução
            <br />
            Estratégica
          </div>
        </div>
      </div>

      {/* ── Painel direito — form Clerk ── */}
      <div
        style={{
          flex: 1,
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 28px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 360 }}>
          {/* Logo Prymeira — tamanho completo */}
          <img
            src="/prymeira-logo.png"
            alt="Prymeira"
            style={{ height: 24, display: 'block', marginBottom: 24 }}
          />

          <h1
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 22,
              fontWeight: 700,
              color: '#111111',
              margin: '0 0 6px',
              letterSpacing: '-0.02em',
            }}
          >
            Acesso à Plataforma
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: '#999999',
              margin: '0 0 24px',
              lineHeight: 1.5,
            }}
          >
            Entre com sua conta Prymeira para validar seus produtos.
          </p>

          <SignIn
            routing="path"
            path="/sign-in"
            appearance={{
              variables: {
                colorPrimary: '#0a0a0a',
              },
              elements: {
                rootBox: { width: '100%' },
                card: {
                  boxShadow: 'none',
                  background: 'transparent',
                  padding: '0',
                  width: '100%',
                },
                header: { display: 'none' },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
