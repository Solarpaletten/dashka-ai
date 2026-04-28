import DashkaChat from '@/components/DashkaChat'
import BodyClassToggle from '@/components/BodyClassToggle'
import '@/styles/chat.css'

export const metadata = {
  title: 'Chat · Dashka',
  description: 'Your conversation with Dashka.',
}

interface Props {
  searchParams?: { prompt?: string | string[] }
}

export default function ChatPage({ searchParams }: Props) {
  // searchParams.prompt may arrive as string | string[] | undefined.
  // Take the first string we can find, fall back to empty.
  const raw = searchParams?.prompt
  const initialPrompt = typeof raw === 'string'
    ? raw
    : Array.isArray(raw) && typeof raw[0] === 'string'
      ? raw[0]
      : ''

  return (
    <div className="dashka-chat">
      <BodyClassToggle className="dl-landing-active" />
      <DashkaChat initialPrompt={initialPrompt} />
    </div>
  )
}
