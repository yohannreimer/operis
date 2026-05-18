// apps/web/src/pages/landing-page.tsx
import { Target, Zap, CalendarCheck } from 'lucide-react';
import type { ReactNode } from 'react';

function ScreenshotPlaceholder({
  width = '100%',
  height,
  label,
  tint,
  border,
}: {
  width?: string | number;
  height: string | number;
  label: string;
  tint: string;
  border: string;
}) {
  return (
    <div
      style={{
        width,
        height,
        background: tint,
        border: `1px solid ${border}`,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ fontSize: 12, color: '#aaa' }}>{label}</span>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  desc,
  iconBg,
  iconColor,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 36,
          height: 36,
          background: iconBg,
          borderRadius: 8,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: iconColor,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#777', marginTop: 3, lineHeight: 1.55 }}>{desc}</div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const primary = '#92400e';
  const primaryLight = '#fef3c7';
  const accent = '#f0c040';
  const nameColor = '#b45309';
  const signUpUrl = '/sign-in';

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#0a0a0a',
        lineHeight: 1.5,
      }}
    >
      {/* Navbar */}
      <nav
        style={{
          background: '#fff',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 22,
              height: 22,
              background: `linear-gradient(135deg, ${primary}, ${nameColor})`,
              borderRadius: 5,
            }}
          />
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>Operis</span>
          <span style={{ fontSize: 11, color: '#bbb', marginLeft: 4 }}>by Prymeira</span>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <a href="/sign-in" style={{ fontSize: 13, color: '#666', textDecoration: 'none' }}>
            Entrar
          </a>
          <a
            href={signUpUrl}
            style={{
              background: primary,
              color: '#fff',
              borderRadius: 6,
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Criar conta grátis
          </a>
        </div>
      </nav>

      {/* Hero — minimalista, copy-first */}
      <section style={{ background: '#fff', padding: '80px 24px 56px', textAlign: 'center' }}>
        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          <div
            style={{
              display: 'inline-block',
              background: primaryLight,
              borderRadius: 20,
              padding: '4px 14px',
              marginBottom: 20,
            }}
          >
            <span style={{ fontSize: 12, color: nameColor, fontWeight: 700, letterSpacing: '0.04em' }}>
              Para executivos e profissionais sênior
            </span>
          </div>
          <h1
            style={{
              fontSize: 58,
              fontWeight: 900,
              lineHeight: 1.04,
              letterSpacing: '-0.04em',
              margin: '0 0 16px',
            }}
          >
            O dia que você<br />termina tudo que<br />
            <em style={{ color: nameColor, fontStyle: 'normal' }}>prometeu.</em>
          </h1>
          <p style={{ fontSize: 18, color: '#555', lineHeight: 1.65, margin: '0 0 28px' }}>
            Estratégia, projetos e foco pessoal num só lugar.<br />Sem dispersão. Sem culpa.
          </p>
          <div
            style={{
              display: 'inline-flex',
              gap: 16,
              alignItems: 'center',
              marginBottom: 32,
            }}
          >
            <a
              href={signUpUrl}
              style={{
                background: primary,
                color: '#fff',
                borderRadius: 8,
                padding: '14px 28px',
                fontSize: 15,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Criar conta grátis →
            </a>
            <span style={{ fontSize: 14, color: '#aaa' }}>Ver demo</span>
          </div>
          {/* Separador decorativo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
            <span style={{ fontSize: 12, color: '#ccc' }}>✦</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
          </div>
        </div>
      </section>

      {/* Problem — bloco narrativo */}
      <section style={{ background: '#fafafa', padding: '64px 24px', borderTop: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#bbb',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 16,
            }}
          >
            O PROBLEMA
          </p>
          <h2
            style={{
              fontSize: 36,
              fontWeight: 900,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              margin: '0 0 16px',
            }}
          >
            Você é capaz. Seus<br />sistemas é que falham.
          </h2>
          <p style={{ fontSize: 17, color: '#555', lineHeight: 1.7 }}>
            Não é falta de disciplina. É que suas metas, projetos e tarefas ficam em três lugares
            diferentes — e nenhum deles conversa com o outro.
          </p>
        </div>
      </section>

      {/* Solution */}
      <section style={{ padding: '64px 24px', borderTop: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#bbb',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 16,
            }}
          >
            A SOLUÇÃO
          </p>
          <h2
            style={{
              fontSize: 36,
              fontWeight: 900,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              margin: '0 0 12px',
            }}
          >
            Estratégia, execução<br />e foco — integrados.
          </h2>
          <p style={{ fontSize: 16, color: '#666', marginBottom: 32, lineHeight: 1.6 }}>
            Do objetivo trimestral até a tarefa de hoje, num único sistema.
          </p>
          {/* Phone mockup */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 240 }}>
              <div
                style={{
                  background: '#1a0e04',
                  borderRadius: 28,
                  padding: 10,
                  boxShadow: '0 12px 48px rgba(180,83,9,0.22)',
                }}
              >
                <ScreenshotPlaceholder
                  height={400}
                  label="screenshot do app"
                  tint={primaryLight}
                  border="#e8d5a0"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features — coluna com separadores */}
      <section style={{ background: '#fafafa', padding: '64px 24px', borderTop: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#bbb',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 24,
            }}
          >
            COMO FUNCIONA
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <FeatureRow
              icon={<Target size={18} />}
              title="Objetivos estratégicos"
              desc="OKRs e metas visuais — veja o progresso real, não o planejado."
              iconBg={primaryLight}
              iconColor={nameColor}
            />
            <div style={{ height: 1, background: '#f0f0f0', margin: '20px 0' }} />
            <FeatureRow
              icon={<Zap size={18} />}
              title="Execução diária"
              desc="Priorize o que importa hoje. Sem lista interminável."
              iconBg={primaryLight}
              iconColor={nameColor}
            />
            <div style={{ height: 1, background: '#f0f0f0', margin: '20px 0' }} />
            <FeatureRow
              icon={<CalendarCheck size={18} />}
              title="Revisão semanal"
              desc="O ritual que separa quem planeja de quem executa."
              iconBg={primaryLight}
              iconColor={nameColor}
            />
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section
        style={{
          background: 'linear-gradient(160deg, #1a0e04, #451a03)',
          padding: '88px 24px',
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            fontSize: 44,
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            margin: '0 0 12px',
          }}
        >
          Seus objetivos merecem<br />mais do que uma planilha.<br />
          <span style={{ color: accent }}>Comece agora.</span>
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', margin: '0 0 28px' }}>
          Grátis pra começar. Sem cartão de crédito.
        </p>
        <a
          href={signUpUrl}
          style={{
            display: 'inline-flex',
            background: accent,
            borderRadius: 8,
            padding: '14px 32px',
            fontSize: 16,
            fontWeight: 800,
            color: '#111',
            textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(240,192,64,0.35)',
          }}
        >
          Criar conta grátis →
        </a>
      </section>

      {/* Footer */}
      <footer
        style={{
          background: '#fff',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #f0f0f0',
        }}
      >
        <span style={{ fontSize: 13, color: '#bbb' }}>© 2026 Prymeira · Operis</span>
        <span style={{ fontSize: 13, color: '#bbb' }}>Termos · Privacidade</span>
      </footer>
    </div>
  );
}
