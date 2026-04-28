import Welcome from '@/components/Welcome'
import BodyClassToggle from '@/components/BodyClassToggle'
import '@/styles/welcome.css'

export const metadata = {
  title: 'Welcome to Dashka',
  description: 'Your AI workspace to think, create, and get things done.',
}

export default function WorkspacePage() {
  return (
    <div className="dashka-welcome">
      {/* Reuse the same body-class trick the landing uses, so globals.css
          (which locks scroll for the swipe app) doesn't bleed in here. */}
      <BodyClassToggle className="dl-landing-active" />
      <Welcome />
    </div>
  )
}
