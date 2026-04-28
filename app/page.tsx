import Link from 'next/link'
import WaitlistForm from '@/components/WaitlistForm'
import DemoMockup from '@/components/DemoMockup'
import BodyClassToggle from '@/components/BodyClassToggle'
import FadeIn from '@/components/FadeIn'
import '@/styles/landing.css'

export const metadata = {
  title: 'Dashka — from idea to execution, in one place',
  description: 'Dashka is your AI workspace. Chat, create, and organize your work in one place.',
}

export default function LandingPage() {
  return (
    <div className="dashka-landing">
      <BodyClassToggle className="dl-landing-active" />

      {/* ── NAV ──────────────────────────────────────────────── */}
      <nav className="dl-nav">
        <div className="dl-nav-inner">
          <div className="dl-logo">
            <span className="dl-logo-mark" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            </span>
            <span className="dl-logo-text">Dashka</span>
          </div>
          <div className="dl-nav-links">
            <a href="#product">Product</a>
            <a href="#preview">Preview</a>
            <Link href="/workspace" className="dl-nav-cta">Open workspace →</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="dl-hero">
        <div className="dl-badge">
          <span className="dl-badge-dot" />
          <span>Now in private beta</span>
        </div>

        <h1 className="dl-h1">
          From idea to execution<span className="dl-h1-em-dash"> — </span>
          <span className="dl-h1-soft">in one place.</span>
        </h1>

        <p className="dl-sub">
          Dashka is your AI workspace.
        </p>

        <div className="dl-form-wrap">
          <WaitlistForm placement="hero" />
        </div>

        <p className="dl-microcopy">
          Free during beta · No credit card · One email per week, max
        </p>
      </section>

      {/* ── PRODUCT ──────────────────────────────────────────── */}
      <FadeIn as="section" id="product" className="dl-product">
        <div className="dl-section-head">
          <span className="dl-eyebrow">Product</span>
          <h2 className="dl-h2">One workspace, end&#8209;to&#8209;end.</h2>
        </div>

        <div className="dl-feature-grid">
          <article className="dl-feature">
            <div className="dl-feature-icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <h3 className="dl-feature-title">Ask anything</h3>
            <p className="dl-feature-desc">
              Get instant answers, ideas, and help — on any topic you bring.
            </p>
          </article>

          <article className="dl-feature">
            <div className="dl-feature-icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </div>
            <h3 className="dl-feature-title">Create anything</h3>
            <p className="dl-feature-desc">
              Generate content, code, and complete workflows in seconds.
            </p>
          </article>

          <article className="dl-feature">
            <div className="dl-feature-icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M3 9h18M9 3v18" />
              </svg>
            </div>
            <h3 className="dl-feature-title">Organize everything</h3>
            <p className="dl-feature-desc">
              Keep projects, files, and history structured and within reach.
            </p>
          </article>
        </div>
      </FadeIn>

      {/* ── LIVE DEMO ─────────────────────────────────────────── */}
      <FadeIn as="section" id="preview" className="dl-demo">
        <div className="dl-section-head">
          <span className="dl-eyebrow">Preview</span>
          <h2 className="dl-h2">It already feels like a product.</h2>
          <p className="dl-section-sub">
            A glance at what you&apos;ll get on day one.
          </p>
        </div>

        <DemoMockup />
      </FadeIn>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <FadeIn as="section" className="dl-cta">
        <div className="dl-cta-card">
          <h2 className="dl-cta-title">Start with Dashka.</h2>
          <p className="dl-cta-sub">
            Join the waitlist. We&apos;re onboarding new accounts every week.
          </p>
          <div className="dl-form-wrap">
            <WaitlistForm placement="footer" />
          </div>
        </div>
      </FadeIn>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="dl-footer">
        <div className="dl-footer-inner">
          <div className="dl-footer-brand">
            <span className="dl-logo-mark" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            </span>
            <span>dashka.ai</span>
          </div>
          <div className="dl-footer-links">
            <a href="mailto:hello@dashka.ai">Contact</a>
            <Link href="/workspace">Workspace</Link>
          </div>
          <div className="dl-footer-meta">
            © {new Date().getFullYear()} Dashka
          </div>
        </div>
      </footer>
    </div>
  )
}
