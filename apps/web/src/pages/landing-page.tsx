// apps/web/src/pages/landing-page.tsx
import { BookOpen, Brain, Flame, FolderKanban, Inbox, Timer, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';

const prymeiraLogo = '/favicon.png';

// ─── Solution section (auto-rotating screenshots) ─────────────────────────────

const OPERIS_AUTO_INTERVAL = 4500;

const opérisSolutionFeatures = [
  {
    src: '/inbox.png',
    icon: <Inbox size={16} />,
    label: 'Inbox — captura rápida',
    desc: 'Tudo que surge vai pro Inbox sem fricção — com @frente para já vincular ao contexto certo. Negócios, vida, projetos: cada item no lugar.',
  },
  {
    src: '/inbox-hoje-ativo.png',
    icon: <Zap size={16} />,
    label: 'Ativar para hoje',
    desc: 'Com um clique você abre o modo Hoje no Inbox: esquerda mostra só o que você ativou, direita o restante. MIT no topo. Timer por item.',
  },
  {
    src: '/hoje.png',
    icon: <Timer size={16} />,
    label: 'Planner do dia',
    desc: 'Top 3 prioridades. Agenda com arrastar e soltar. Deep Work timer embutido. Pool de execução ao lado. Capacidade gerenciada para não sobrecarregar.',
  },
  {
    src: '/habitos.png',
    icon: <Flame size={16} />,
    label: 'Hábitos & RPG de vida',
    desc: '6 áreas monitoradas: Corpo, Mente, Trabalho, Relações, Finanças e Crescimento. Níveis, streaks e progresso que acumula dia após dia.',
  },
  {
    src: '/notas.png',
    icon: <BookOpen size={16} />,
    label: 'Segundo cérebro',
    desc: 'Editor com blocos, diagrama, mapa mental e lousa — tudo na mesma nota. Coleções, pastas, transcrição de voz e IA. Vinculado ao seu contexto.',
  },
];

function OpérisSolutionSection({ primary, primaryLight }: { primary: string; primaryLight: string }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setActive(i => (i + 1) % opérisSolutionFeatures.length);
    }, OPERIS_AUTO_INTERVAL);
    return () => clearTimeout(timer);
  }, [active]);

  const feature = opérisSolutionFeatures[active];

  return (
    <section style={{ background: '#fafaf8', padding: '72px 24px 80px', borderTop: '1px solid #f0ebe0' }}>
      <style>{`
        @keyframes operisProgress {
          from { width: 0% }
          to { width: 100% }
        }
      `}</style>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#bbb', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
          O QUE VOCÊ GANHA
        </p>
        <h2 style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.02em', margin: '0 0 12px', color: '#111' }}>
          Tudo que você precisa para executar.<br />Num único lugar.
        </h2>
        <p style={{ fontSize: 16, color: '#666', margin: '0 0 32px', lineHeight: 1.6 }}>
          Do pensamento que surgiu agora até o bloco de deep work das 14h — sem sair do Operis, sem perder o contexto.
        </p>

        <div style={{
          background: '#fff',
          border: '1px solid #ede0cc',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(194,65,12,0.12), 0 8px 24px rgba(194,65,12,0.06)',
        }}>
          {/* Chrome bar */}
          <div style={{ background: '#1a0e04', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
            <div style={{ flex: 1, background: '#3a2010', borderRadius: 4, height: 12, margin: '0 12px' }} />
          </div>
          {/* Progress bar */}
          <div style={{ height: 3, background: primaryLight, position: 'relative', overflow: 'hidden' }}>
            <div
              key={active}
              style={{
                position: 'absolute',
                top: 0, left: 0, height: '100%',
                background: primary,
                animation: `operisProgress ${OPERIS_AUTO_INTERVAL}ms linear forwards`,
              }}
            />
          </div>
          {/* Screenshot stack */}
          <div style={{ position: 'relative', height: 500, overflow: 'hidden', background: '#f5f0ea' }}>
            {opérisSolutionFeatures.map((f, i) => (
              <img
                key={f.src}
                src={f.src}
                alt={f.label}
                style={{
                  position: 'absolute',
                  top: 0, left: 0,
                  width: '100%', height: 'auto',
                  display: 'block',
                  opacity: i === active ? 1 : 0,
                  transition: 'opacity 0.55s ease',
                }}
              />
            ))}
            <div style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: 80,
              background: 'linear-gradient(to bottom, transparent, #ffffff)',
              pointerEvents: 'none',
            }} />
          </div>
          {/* Label bar */}
          <div style={{
            padding: '16px 24px',
            borderTop: `3px solid ${primary}`,
            display: 'flex', alignItems: 'center', gap: 14,
            background: '#fff',
          }}>
            <div style={{
              width: 36, height: 36,
              background: primary,
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', flexShrink: 0,
            }}>
              {feature.icon}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 2 }}>{feature.label}</div>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>{feature.desc}</div>
            </div>
          </div>
        </div>

        {/* Navigation pills */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' as const }}>
          {opérisSolutionFeatures.map((f, i) => (
            <button
              key={f.label}
              onClick={() => setActive(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 18px',
                border: 'none', borderRadius: 999, cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                transition: 'all 0.15s',
                background: active === i ? primary : '#fff',
                color: active === i ? '#fff' : '#555',
                boxShadow: active === i
                  ? '0 4px 14px rgba(194,65,12,0.28)'
                  : '0 1px 4px rgba(0,0,0,0.08)',
              }}
            >
              <span style={{ opacity: active === i ? 1 : 0.5, display: 'flex' }}>{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Operis landing page ──────────────────────────────────────────────────────

export function LandingPage() {
  const primary = '#c2410c';
  const primaryLight = '#fff7ed';
  const accent = '#f97316';
  const signUpUrl = '/sign-in';

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#0a0a0a', lineHeight: 1.5 }}>
      <style>{`
        .operis-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(194,65,12,0.42) !important; }
        .operis-accent-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(249,115,22,0.48) !important; }
      `}</style>

      {/* Navbar */}
      <nav style={{
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(12px)',
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={prymeiraLogo} alt="Prymeira" style={{ width: 22, height: 22, display: 'block', objectFit: 'contain' }} />
          <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.03em' }}>Operis</span>
          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>by Prymeira</span>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <a href="/sign-in" style={{ fontSize: 13, color: '#666', textDecoration: 'none' }}>Entrar</a>
          <a href={signUpUrl} style={{
            background: primary, color: '#fff', borderRadius: 8,
            padding: '8px 18px', fontSize: 13, fontWeight: 700, textDecoration: 'none',
          }}>Criar conta grátis</a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        background: 'radial-gradient(ellipse 85% 75% at 72% 50%, #fde8d0 0%, #fdf0e4 28%, #fdf8f2 55%, #fffcfa 100%)',
        padding: '88px 24px 80px',
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 56, alignItems: 'center',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: primary }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: primary, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                Para quem leva execução a sério
              </span>
            </div>
            <h1 style={{
              fontSize: 'clamp(40px, 5vw, 64px)',
              fontWeight: 900, lineHeight: 1.0,
              letterSpacing: '-0.04em', margin: '0 0 22px',
              color: '#111',
            }}>
              Captura tudo.<br />Executa o que<br />importa<span style={{ color: accent }}>.</span>
            </h1>
            <p style={{ fontSize: 18, color: '#4a5568', lineHeight: 1.72, margin: '0 0 36px', maxWidth: 420 }}>
              Do pensamento que acabou de surgir até o bloco de deep work — Operis é o sistema que conecta intenção, estratégia e execução diária num único lugar.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <a href={signUpUrl} className="operis-cta-btn" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: primary, color: '#fff',
                borderRadius: 10, padding: '15px 32px',
                fontSize: 16, fontWeight: 800, textDecoration: 'none',
                width: 'fit-content',
                boxShadow: '0 8px 24px rgba(194,65,12,0.28)',
                letterSpacing: '-0.01em',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}>
                Criar conta grátis →
              </a>
              <div style={{ fontSize: 13, color: '#64748b', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: '#16a34a', fontWeight: 800 }}>✓</span> Grátis pra começar
              </div>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{
              borderRadius: 14, overflow: 'hidden',
              transform: 'perspective(900px) rotateY(-12deg) rotateX(4deg)',
              boxShadow: '28px 32px 80px rgba(194,65,12,0.2), 0 4px 16px rgba(194,65,12,0.08)',
            }}>
              <div style={{
                background: '#1a0e04', height: 34,
                display: 'flex', alignItems: 'center',
                padding: '0 16px', gap: 6,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                  Hoje — Operis
                </span>
              </div>
              <img
                src="/operis-hoje.png"
                alt="Planner Operis"
                width={600}
                height={230}
                style={{ width: '100%', height: 230, objectFit: 'cover', objectPosition: 'top', display: 'block' }}
              />
            </div>
            {/* Floating card — streak */}
            <div style={{
              position: 'absolute', bottom: -28, right: -20,
              background: '#fff', border: '1px solid rgba(194,65,12,0.1)',
              borderRadius: 14, padding: '14px 22px',
              boxShadow: '0 12px 36px rgba(0,0,0,0.1)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 5 }}>
                Streak de execução
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: primary, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 6 }}>
                🔥 21 dias
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <div style={{ background: primary, padding: '20px 24px' }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', justifyContent: 'center',
          gap: 56, alignItems: 'center',
        }}>
          {[
            { num: 'Inbox → Hoje', label: 'em um clique' },
            { num: '15+ motores', label: 'de projeto (OKR · Pipeline · Runway)' },
            { num: 'Deep Work', label: 'timer nativo no planner' },
          ].map((s, i) => (
            <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 56 }}>
              {i > 0 && <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.12)' }} />}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: accent, letterSpacing: '-0.02em' }}>{s.num}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two Workflows — KEY DIFFERENTIATOR */}
      <section style={{ padding: '80px 24px 64px', background: '#fff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#cbd5e1', letterSpacing: '0.14em', textTransform: 'uppercase' as const, marginBottom: 14 }}>
            COMO FUNCIONA
          </p>
          <h2 style={{
            fontSize: 'clamp(28px, 3vw, 42px)',
            fontWeight: 900, lineHeight: 1.1,
            letterSpacing: '-0.03em', margin: '0 0 12px', color: '#111',
          }}>
            Dois jeitos de trabalhar.<br />Um único sistema.
          </h2>
          <p style={{ fontSize: 16, color: '#64748b', margin: '0 0 40px', maxWidth: 540, lineHeight: 1.65 }}>
            Você pode começar capturando qualquer coisa no inbox e ativar para hoje — ou criar frentes, projetos com metodologia e tarefas estruturadas. Os dois fluxos se encontram no planner do dia.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Workflow A — Inbox first */}
            <div style={{
              background: 'linear-gradient(135deg, #fff7ed 0%, #fff 60%)',
              border: `2px solid ${primary}22`,
              borderRadius: 16, padding: '32px 28px',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                background: `linear-gradient(90deg, ${primary}, ${accent})`,
              }} />
              <div style={{
                width: 44, height: 44, background: `${primary}18`,
                borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 18, color: primary,
              }}>
                <Inbox size={22} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: primary, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 8 }}>
                Fluxo A — Captura e foco
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.02em', lineHeight: 1.2, color: '#111' }}>
                Inbox → marcar hoje → executar
              </h3>
              <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7, margin: 0 }}>
                Tudo que você pensa vai para o Inbox sem fricção. Quando for planejar o dia, você ativa o que importa para hoje, marca o MIT — a tarefa mais importante — e executa com timer por item. Nenhuma decisão esquecida, nenhum contexto perdido.
              </p>
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Captura em segundos, sem estrutura forçada', 'MIT: a tarefa mais importante fica no topo', 'Timer por item — saiba onde vai seu tempo'].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#444' }}>
                    <span style={{ color: primary, fontWeight: 900, fontSize: 14 }}>→</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Workflow B — Structured */}
            <div style={{
              background: 'linear-gradient(135deg, #f8faff 0%, #fff 60%)',
              border: '2px solid #e2e8f022',
              borderRadius: 16, padding: '32px 28px',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
              }} />
              <div style={{
                width: 44, height: 44, background: '#3b82f610',
                borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 18, color: '#3b82f6',
              }}>
                <FolderKanban size={22} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#3b82f6', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 8 }}>
                Fluxo B — Estratégia e projetos
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.02em', lineHeight: 1.2, color: '#111' }}>
                Frente → Projeto → Tarefa → Planner
              </h3>
              <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7, margin: 0 }}>
                Organize a vida em Frentes (Negócios, Vida, Autoridade). Dentro de cada frente, crie projetos com o motor certo: OKR, pipeline, runway, captação. Cada tarefa carrega tipo (A/B/C), energia e intenção de execução — e flui direto para o planner do dia.
              </p>
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Frentes com modo expansão, manutenção ou standby', '15+ metodologias com scores calculados automaticamente', 'Tarefa tipo A bloqueia B/C quando precisa — por design'].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#444' }}>
                    <span style={{ color: '#3b82f6', fontWeight: 900, fontSize: 14 }}>→</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section style={{ padding: '64px 24px 56px', background: '#fafbfc', borderTop: '1px solid #f0f4f8' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#cbd5e1', letterSpacing: '0.14em', textTransform: 'uppercase' as const, marginBottom: 24 }}>
            O PROBLEMA
          </p>
          <h2 style={{
            fontSize: 'clamp(28px, 3.2vw, 42px)',
            fontWeight: 900, lineHeight: 1.1,
            letterSpacing: '-0.03em', margin: '0 0 32px', color: '#111',
          }}>
            Você sabe o que precisa fazer.<br />O problema é fazer <em style={{ fontStyle: 'normal', color: primary }}>o certo</em>.
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              {
                num: '01',
                title: 'Quatro ferramentas, zero contexto',
                sub: 'Ideias no Notion, tarefas no Todoist, calendário no Google, hábitos no Habitica. Todo dia você começa do zero porque nada conversa.',
              },
              {
                num: '02',
                title: 'Urgência engole estratégia todo dia',
                sub: 'As tarefas importantes — as que movem o jogo — ficam no backlog há semanas. O que domina o dia são as urgentes, as fáceis, as barulhentas.',
              },
              {
                num: '03',
                title: 'Sem dado, sem evolução',
                sub: 'Na sexta você não lembra o que entregou na segunda. Sem score, sem histórico, sem ritual de revisão — o mesmo padrão se repete todo mês.',
              },
            ].map(card => (
              <div key={card.num} style={{
                background: '#fff5f5', border: '1px solid #fde0e0',
                borderRadius: 10, padding: '28px 24px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#dc2626', letterSpacing: '0.1em', marginBottom: 16 }}>{card.num}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#111', lineHeight: 1.3, marginBottom: 10 }}>{card.title}</div>
                <div style={{ fontSize: 14, color: '#888', lineHeight: 1.65 }}>{card.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution */}
      <OpérisSolutionSection primary={primary} primaryLight={primaryLight} />

      {/* Projects spotlight */}
      <section style={{ padding: '72px 24px 80px', background: '#0f0805' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: `${accent}88`, letterSpacing: '0.14em', textTransform: 'uppercase' as const, marginBottom: 14 }}>
                PROJETOS COM MOTOR
              </p>
              <h2 style={{
                fontSize: 'clamp(28px, 2.8vw, 40px)',
                fontWeight: 900, lineHeight: 1.1,
                letterSpacing: '-0.03em', margin: '0 0 20px', color: '#fff',
              }}>
                Cada projeto<br />no motor certo.
              </h2>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.72, margin: '0 0 28px' }}>
                Operis não é um gestor de tarefas genérico. Cada projeto roda com a metodologia que o tipo de trabalho exige — e o sistema calcula o score automaticamente.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'OKR', desc: 'Key Results com confiança e tracking de progresso' },
                  { label: 'Pipeline', desc: 'Negócios com estágios, probabilidade e forecast de receita' },
                  { label: 'Runway', desc: 'Projetos com orçamento — saiba quando o projeto acaba' },
                  { label: 'Entrega · Captação · Campanha · Autoridade…', desc: '15+ motores disponíveis' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{
                      marginTop: 2, width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                      background: `${accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <img
                src="/operis-projetos.png"
                alt="Projetos Operis"
                style={{
                  width: '100%', borderRadius: 12, display: 'block',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Intelligence / Evolution */}
      <section style={{ padding: '72px 24px', background: '#fff', borderTop: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#cbd5e1', letterSpacing: '0.14em', textTransform: 'uppercase' as const, marginBottom: 14 }}>
                INTELIGÊNCIA DE EXECUÇÃO
              </p>
              <h2 style={{
                fontSize: 'clamp(28px, 2.8vw, 40px)',
                fontWeight: 900, lineHeight: 1.1,
                letterSpacing: '-0.03em', margin: '0 0 20px', color: '#111',
              }}>
                O sistema aprende<br />com você e te <span style={{ color: primary }}>evolui</span>.
              </h2>
              <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.72, margin: '0 0 28px' }}>
                Operis rastreia seus padrões de execução e te posiciona numa jornada de evolução: de Reativo a Executor, de Executor a Construtor, de Construtor a Estrategista. Com alertas quando você está fragmentando a semana, sobrecarregando o dia ou deixando projetos estratégicos sem movimento.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { num: 'Execution', label: 'Score diário composto' },
                  { num: 'Deep Work', label: 'tracker semanal' },
                  { num: 'Ritual', label: 'revisão semanal e mensal' },
                  { num: 'Alertas', label: 'de fragmentação e foco' },
                ].map(stat => (
                  <div key={stat.num} style={{
                    background: primaryLight, borderRadius: 10,
                    padding: '16px 18px', border: `1px solid ${primary}18`,
                  }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: primary, letterSpacing: '-0.02em' }}>{stat.num}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { stage: 'Reativo', desc: 'Apaga incêndios, opera no improviso', color: '#ef4444', active: false },
                { stage: 'Executor', desc: 'Cumpre compromissos, mantém o ritmo', color: '#f97316', active: false },
                { stage: 'Construtor', desc: 'Move projetos estratégicos com consistência', color: primary, active: true },
                { stage: 'Estrategista', desc: 'Opera em nível de sistema, alavanca o que importa', color: '#7c3aed', active: false },
              ].map(item => (
                <div key={item.stage} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '14px 20px',
                  borderRadius: 10,
                  background: item.active ? primaryLight : '#fafafa',
                  border: `1.5px solid ${item.active ? primary + '44' : '#eee'}`,
                  transition: 'all 0.15s',
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: item.color, flexShrink: 0,
                    boxShadow: item.active ? `0 0 0 4px ${item.color}22` : 'none',
                  }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: item.active ? primary : '#111' }}>{item.stage}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{item.desc}</div>
                  </div>
                  {item.active && (
                    <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: primary, background: `${primary}15`, borderRadius: 4, padding: '2px 8px' }}>
                      você está aqui
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Quote */}
      <section style={{ padding: '72px 24px', background: '#fafbfc', borderTop: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <Brain size={28} style={{ color: accent, marginBottom: 16 }} />
          <blockquote style={{
            fontSize: 'clamp(22px, 2.5vw, 30px)',
            fontWeight: 800, lineHeight: 1.35,
            letterSpacing: '-0.02em',
            color: '#111', margin: '0 0 20px',
            fontStyle: 'normal',
          }}>
            "A disciplina não é força de vontade.<br />É o sistema que te mantém em movimento<br />quando a motivação vai embora."
          </blockquote>
          <p style={{ fontSize: 15, color: '#888', maxWidth: 480, margin: '0 auto' }}>
            Operis foi construído para ser esse sistema — não para você planejar mais, mas para executar melhor. Todo dia. Com dados.
          </p>
        </div>
      </section>

      {/* CTA Final */}
      <section style={{
        background: 'linear-gradient(160deg, #1a0e04, #2d1406)',
        position: 'relative', overflow: 'hidden',
        padding: '104px 24px', textAlign: 'center',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '28px 28px', pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: `${accent}88`, letterSpacing: '0.14em', textTransform: 'uppercase' as const, marginBottom: 16 }}>
            COMECE AGORA
          </p>
          <h2 style={{
            fontSize: 'clamp(32px, 4vw, 52px)',
            fontWeight: 900, color: '#fff',
            lineHeight: 1.1, letterSpacing: '-0.03em',
            margin: '0 0 18px',
          }}>
            O seu sistema de execução<br />começa hoje.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.42)', margin: '0 0 36px', lineHeight: 1.6 }}>
            Inbox. Planner. Projetos. Hábitos. Segundo cérebro. Tudo conectado.<br />Grátis pra começar.
          </p>
          <a href={signUpUrl} className="operis-accent-btn" style={{
            background: accent, borderRadius: 10,
            padding: '16px 40px', fontSize: 17, fontWeight: 900,
            color: '#fff', textDecoration: 'none',
            display: 'inline-flex', letterSpacing: '-0.01em',
            boxShadow: '0 8px 32px rgba(249,115,22,0.32)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}>
            Criar conta grátis →
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        background: '#fff', padding: '20px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: '1px solid #f0f0f0',
      }}>
        <span style={{ fontSize: 13, color: '#bbb' }}>© 2026 Prymeira · Operis</span>
        <span style={{ fontSize: 13, color: '#bbb' }}>Termos · Privacidade</span>
      </footer>
    </div>
  );
}
