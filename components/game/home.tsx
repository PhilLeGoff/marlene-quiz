"use client";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Crown,
  LockKeyhole,
  Monitor,
  Music2,
  PencilRuler,
  Play,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Brand, CakeArt, Confetti, Avatar } from "./art";
import { useParty } from "./use-party";
import { Modal } from "./modal";
export function Home() {
  const c = useParty();
  const [nickname, setNickname] = useState(""),
    [avatar, setAvatar] = useState(0),
    [rules, setRules] = useState(false);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (await c.command("join", { nickname, avatar })) location.assign("/play");
  }
  return (
    <div className="home-page">
      <Confetti />
      <header className="site-header container">
        <Brand />
        <nav aria-label="Navigation principale">
          <a className="nav-link" href="#programme">
            Au programme
          </a>
          <button className="nav-link" onClick={() => setRules(true)}>
            Les règles du jeu
          </button>
          <a className="backstage" href="/admin">
            <LockKeyhole size={15} /> Côté coulisses <ArrowRight size={15} />
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="hero container">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> JOYEUX ANNIVERSAIRE MARLÈNE 🎂
            </div>
            <h1>
              Qui connaît
              <br />
              vraiment
              <br />
              <span>
                Marlène ?
                <svg viewBox="0 0 350 22" aria-hidden="true">
                  <path
                    d="M5 12q160-18 337-3M32 20q143-14 273-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <Sparkles className="hero-spark" size={46} aria-hidden="true" />
            </h1>
            <p className="hero-description">
              Des quiz, des dessins, des petits dossiers.
              <br />
              Une soirée pour célébrer <strong>notre préférée.</strong>
            </p>
            <div className="hero-tags">
              <span>
                <Music2 size={16} /> Blind tests
              </span>
              <span>
                <PencilRuler size={16} /> Défis dessin
              </span>
              <span>
                <Trophy size={16} /> Gloire éternelle
              </span>
            </div>
            <div className="hero-aside">
              <div className="mini-avatars">
                {[0, 1, 2, 3].map((i) => (
                  <Avatar key={i} index={i} size={33} />
                ))}
              </div>
              <p>
                Ramène ton téléphone.
                <br />
                <strong>Et ta mauvaise foi.</strong>
              </p>
            </div>
          </div>
          <div className="hero-right">
            <CakeArt />
            <div className="join-ticket">
              <div className="ticket-top">
                <span className="small-caps">TON INVITATION À LA FÊTE</span>
                <span className="ticket-star">✦</span>
              </div>
              <div className="ticket-body">
                <h2>Entre dans la danse.</h2>
                <p>Ton petit nom, et c’est parti !</p>
                <form onSubmit={join}>
                  <div className="join-fields name-only">
                    <label>
                      Ton petit nom
                      <input
                        disabled={c.loading}
                        autoComplete="nickname"
                        name="nickname"
                        placeholder="La légende du groupe"
                        minLength={1}
                        maxLength={24}
                        required
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                      />
                    </label>
                  </div>
                  <div
                    className="avatar-picker"
                    aria-label="Choisis ton avatar"
                  >
                    {Array.from({ length: 6 }, (_, i) => (
                      <button
                        type="button"
                        key={i}
                        aria-label={`Avatar ${i + 1}`}
                        aria-pressed={avatar === i}
                        onClick={() => setAvatar(i)}
                        className={avatar === i ? "selected" : ""}
                      >
                        <Avatar index={i} size={36} />
                        {avatar === i && (
                          <span>
                            <Check size={10} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {c.error && (
                    <p className="error" role="alert">
                      {c.error}
                    </p>
                  )}
                  <button
                    className="btn primary join-button"
                    disabled={c.busy || c.loading}
                  >
                    {c.busy ? "On te garde une place…" : "Rejoindre la fête 🎉"}
                    <ArrowRight size={20} />
                  </button>
                </form>
                <p className="join-note">
                  <ShieldCheck size={13} /> Pas de compte. Juste de la bonne
                  humeur.
                </p>
              </div>
              <div className="ticket-bottom">
                <span
                  className={`live-dot ${c.data?.initialized ? "" : "muted"}`}
                />
                {c.data?.initialized
                  ? `${c.data.players?.length ?? 0} invité${c.data.players?.length === 1 ? "" : "s"} dans la salle`
                  : "La fête se prépare…"}
                <span>ACCÈS VIP POUR TOUT LE MONDE</span>
              </div>
            </div>
            <div className="join-caption">
              Les dossiers restent entre nous. Enfin, presque.
            </div>
          </div>
        </section>
        <section className="programme container" id="programme">
          <div className="section-heading">
            <span className="small-caps">LE PROGRAMME DES RÉJOUISSANCES</span>
            <span>Un peu de talent. Beaucoup de culot.</span>
          </div>
          <div className="feature-grid">
            <article className="feature-card coral">
              <span className="feature-icon">
                <Sparkles />
              </span>
              <div>
                <h3>Les petits dossiers</h3>
                <p>
                  Tu pensais tout savoir ?<br />
                  On va vérifier ça.
                </p>
              </div>
              <span className="feature-number">01</span>
            </article>
            <article className="feature-card lilac">
              <span className="feature-icon">
                <Music2 />
              </span>
              <div>
                <h3>Monte le son</h3>
                <p>
                  Des blind tests pour chanter.
                  <br />
                  Juste ou faux, on t’aime.
                </p>
              </div>
              <span className="feature-number">02</span>
            </article>
            <article className="feature-card mint">
              <span className="feature-icon">
                <PencilRuler />
              </span>
              <div>
                <h3>Sors ton Picasso</h3>
                <p>
                  Un doigt, un écran.
                  <br />
                  Le talent est facultatif.
                </p>
              </div>
              <span className="feature-number">03</span>
            </article>
          </div>
        </section>
      </main>
      <footer className="site-footer container">
        <span>
          Fait avec amour. Et quelques dossiers.{" "}
          <span aria-hidden="true">♡</span>
        </span>
        <div>
          <a href="/marlene">
            <Crown size={15} /> Espace Marlène
          </a>
          <a href="/present">
            <Monitor size={15} /> Grand écran
          </a>
        </div>
        <span className="footer-party">
          UNE FÊTE. UNE REINE. ZÉRO PRESSION.
        </span>
      </footer>
      {rules && (
        <Modal title="Les règles du jeu" onClose={() => setRules(false)}>
          <span className="pill lilac">LE PETIT BRIEF</span>
          <h2 id="rules-title">Que la mauvaise foi gagne.</h2>
          <p>
            Rejoins avec le code affiché à l’écran et réponds sur ton téléphone.
            L’hôte mène la danse.
          </p>
          <div className="rules-scores">
            <span>
              <b>+1</b> bonne réponse
            </span>
            <span>
              <b>−1</b> mauvaise réponse
            </span>
            <span>
              <b>0</b> tu passes
            </span>
          </div>
          <p>
            Les défis dessin et le premier mot trouvé au Pictionary rapportent{" "}
            <strong>+5 points</strong>. Aux questions à réponses multiples,
            chaque case cochée compte : +1 si elle est juste, −1 sinon. Les
            questions facultatives se passent sans pénalité.
          </p>
          <p>
            En cas d’égalité : bonnes réponses, puis temps de réponse cumulé.
            Sinon, la gloire se partage !
          </p>
          <button className="btn primary" onClick={() => setRules(false)}>
            J’ai tout compris <Check size={18} />
          </button>
        </Modal>
      )}
    </div>
  );
}
