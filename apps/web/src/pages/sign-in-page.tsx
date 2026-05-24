// apps/web/src/pages/sign-in-page.tsx
import { useEffect, useState } from 'react';
import { SignIn } from '@clerk/clerk-react';

// ── Focus-blocks decoration — daily planner motif ─────────────────────────────
const FOCUS_BLOCKS = [
  { label: '08:00', width: 52, muted: true },
  { label: '09:30', width: 80, accent: true },
  { label: '11:00', width: 38, muted: true },
  { label: '14:00', width: 65, muted: true },
  { label: '15:30', width: 44, accent: true },
  { label: '17:00', width: 55, muted: true },
];

function FocusBlocksDecoration() {
  return (
    <div style={{
      position: 'absolute',
      bottom: 52,
      left: 0,
      right: 0,
      padding: '0 48px',
      display: 'grid',
      gap: 7,
      pointerEvents: 'none',
    }}>
      {FOCUS_BLOCKS.map((b, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 7 }}>
          <span style={{
            width: 32,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: b.accent ? 'rgba(249,115,22,0.55)' : 'rgba(232,228,223,0.18)',
            flexShrink: 0,
            lineHeight: 1,
          }}>{b.label}</span>
          <div style={{
            width: b.width,
            height: '100%',
            borderRadius: 3,
            background: b.accent
              ? 'rgba(249,115,22,0.75)'
              : 'rgba(232,228,223,0.12)',
            flexShrink: 0,
          }} />
          {b.accent && (
            <div style={{
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: '#f97316',
              opacity: 0.9,
              flexShrink: 0,
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Operis login layout ───────────────────────────────────────────────────────
export function SignInPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#141418',
      fontFamily: '"Area Normal","Aptos","SF Pro Display","Segoe UI Variable",system-ui,sans-serif',
    }}>
      <style>{`
        .op-clerk .cl-card,
        .op-clerk .cl-card * { background: transparent !important; box-shadow: none !important; border: none !important; }
        .op-clerk .cl-formFieldInput {
          background: #2a2a30 !important;
          border: 1px solid rgba(255,255,255,0.09) !important;
          color: #e8e4df !important;
          border-radius: 9px !important;
          height: 42px !important;
          padding: 0 14px !important;
        }
        .op-clerk .cl-formFieldInput:focus {
          border-color: #f97316 !important;
          box-shadow: 0 0 0 2px rgba(249,115,22,0.18) !important;
        }
        .op-clerk .cl-formButtonPrimary {
          background: #f97316 !important;
          color: #fff !important;
          font-weight: 700 !important;
          box-shadow: 0 4px 16px rgba(249,115,22,0.28) !important;
          border-radius: 9px !important;
          padding: 13px 20px !important;
          height: 46px !important;
          font-size: 14px !important;
        }
        .op-clerk .cl-formButtonPrimary:hover { background: #ea6c0a !important; }
        .op-clerk .cl-socialButtonsBlockButton {
          background: #2a2a30 !important;
          border: 1px solid rgba(255,255,255,0.09) !important;
          color: #e8e4df !important;
          border-radius: 9px !important;
          padding: 12px 20px !important;
          height: 44px !important;
          gap: 10px !important;
        }
        .op-clerk .cl-socialButtonsBlockButton:hover { background: #2f2f36 !important; }
        .op-clerk .cl-socialButtonsBlockButtonText { font-size: 14px !important; font-weight: 500 !important; }
        .op-clerk .cl-dividerLine { background: rgba(255,255,255,0.07) !important; }
        .op-clerk .cl-dividerText { color: #6b6560 !important; }
        .op-clerk .cl-footerActionLink { color: #f97316 !important; }
        .op-clerk .cl-footer,
        .op-clerk .cl-footerAction { background: transparent !important; }
        .op-clerk .cl-card { padding: 0 !important; }
      `}</style>

      {/* ── Left: brand panel ── */}
      <div style={{
        width: 'min(52%, 580px)',
        flexShrink: 0,
        background: 'linear-gradient(155deg, #141418 0%, #18181d 45%, #1c1a14 100%)',
        padding: '48px 52px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Ambient orange glows */}
        <div style={{
          position: 'absolute', top: -80, left: -60,
          width: 380, height: 380, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(249,115,22,0.07) 0%, transparent 68%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: 60, right: -80,
          width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(249,115,22,0.04) 0%, transparent 68%)',
          pointerEvents: 'none',
        }} />

        {/* Eyebrow */}
        <div style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.6s ease' }}>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
            textTransform: 'uppercase' as const,
            color: 'rgba(249,115,22,0.45)',
          }}>by Prymeira</span>
        </div>

        {/* Identity */}
        <div style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s',
        }}>
          {/* Logo mark + name */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <div style={{
              width: 44, height: 44,
              background: '#f97316',
              borderRadius: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 8px 28px rgba(249,115,22,0.32), 0 2px 8px rgba(249,115,22,0.18)',
            }}>
              {/* Target / focus icon */}
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="7.5" stroke="#fff" strokeWidth="1.6" />
                <circle cx="10" cy="10" r="4" stroke="#fff" strokeWidth="1.6" />
                <circle cx="10" cy="10" r="1.5" fill="#fff" />
                <line x1="10" y1="1" x2="10" y2="4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="10" y1="16" x2="10" y2="19" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </div>
            <span style={{
              fontSize: 30, fontWeight: 900,
              letterSpacing: '-0.03em',
              color: '#e8e4df', lineHeight: 1,
            }}>Operis</span>
          </div>

          {/* Headline */}
          <p style={{
            margin: '0 0 20px',
            fontSize: 'clamp(26px, 3vw, 40px)',
            fontWeight: 800, lineHeight: 1.1,
            letterSpacing: '-0.03em',
            color: '#e8e4df', maxWidth: '11em',
          }}>
            Execute o que{' '}
            <span style={{ color: '#f97316' }}>realmente importa.</span>
          </p>

          <p style={{
            margin: '0 0 36px',
            fontSize: 15, fontWeight: 450,
            lineHeight: 1.65, color: '#6b6560',
            maxWidth: '30ch',
          }}>
            Inbox, blocos de foco, projetos e hábitos — sua execução pessoal num só lugar.
          </p>

          {/* Feature chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
            {['Inbox', 'Blocos de foco', 'Projetos', 'Hábitos'].map(f => (
              <span key={f} style={{
                border: '1px solid rgba(232,228,223,0.09)',
                borderRadius: 999,
                padding: '6px 13px',
                fontSize: 12, fontWeight: 700,
                color: 'rgba(232,228,223,0.38)',
                letterSpacing: '0.01em',
              }}>{f}</span>
            ))}
          </div>
        </div>

        <div />

        {/* Focus blocks decoration */}
        <FocusBlocksDecoration />

        {/* Bottom gradient */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 52,
          background: 'linear-gradient(to top, #141418, transparent)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* ── Right: auth panel ── */}
      <div style={{
        flex: 1,
        background: '#1a1a1e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 52px',
        borderLeft: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div
          className="op-clerk"
          style={{
            width: '100%',
            maxWidth: 420,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.6s ease 0.18s, transform 0.6s ease 0.18s',
          }}
        >
          {/* Custom heading */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{
              margin: 0, fontSize: 22, fontWeight: 700,
              letterSpacing: '-0.02em', lineHeight: 1.2,
              color: '#e8e4df',
            }}>Acesse sua conta</h2>
            <p style={{
              margin: '6px 0 0', fontSize: 14,
              color: '#6b6560', lineHeight: 1.5,
            }}>Bem-vindo de volta ao Operis</p>
          </div>
          <SignIn
            routing="path"
            path="/sign-in"
            appearance={{
              variables: {
                colorPrimary: '#f97316',
                colorBackground: '#1a1a1e',
                colorInputBackground: '#2a2a30',
                colorInputText: '#e8e4df',
                colorText: '#e8e4df',
                colorTextSecondary: '#a09a92',
                colorNeutral: '#6b6560',
                borderRadius: '9px',
                fontFamily: '"Area Normal","Aptos","SF Pro Display",system-ui,sans-serif',
                fontSize: '14px',
              },
              elements: {
                rootBox: { width: '100%' },
                card: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 },
                header: { display: 'none' },
                footer: { background: 'transparent' },
                footerAction: { background: 'transparent' },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
