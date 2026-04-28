/**
 * lib/markdown.ts
 * Zero-dependency markdown → HTML converter.
 * Handles: headers, bold, italic, code blocks, inline code, lists, line breaks.
 */

export function renderMarkdown(text: string): string {
  let html = text

  // Escape HTML first (prevent XSS from AI responses)
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // ── Code blocks (``` ... ```) ──────────────────────────────────────
  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, _lang, code) =>
    `<pre><code>${code.trim()}</code></pre>`
  )

  // ── Inline code (`...`) ────────────────────────────────────────────
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>')

  // ── Headers ───────────────────────────────────────────────────────
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm,  '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm,   '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm,    '<h1>$1</h1>')

  // ── Bold + italic ──────────────────────────────────────────────────
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g,         '<em>$1</em>')

  // ── Unordered lists (-, *, +) ──────────────────────────────────────
  html = html.replace(/(^[-*+] .+(\n[-*+] .+)*)/gm, (match) => {
    const items = match.split('\n').map(line =>
      `<li>${line.replace(/^[-*+] /, '')}</li>`
    ).join('')
    return `<ul>${items}</ul>`
  })

  // ── Ordered lists (1. 2. ...) ──────────────────────────────────────
  html = html.replace(/(^\d+\. .+(\n\d+\. .+)*)/gm, (match) => {
    const items = match.split('\n').map(line =>
      `<li>${line.replace(/^\d+\. /, '')}</li>`
    ).join('')
    return `<ol>${items}</ol>`
  })

  // ── Horizontal rule ────────────────────────────────────────────────
  html = html.replace(/^---+$/gm, '<hr>')

  // ── Paragraphs / line breaks ───────────────────────────────────────
  // Double newline = paragraph break, single = <br>
  html = html
    .split(/\n\n+/)
    .map(para => {
      const t = para.trim()
      if (!t) return ''
      // Don't wrap block elements in <p>
      if (/^<(h[1-6]|ul|ol|pre|hr)/.test(t)) return t
      return `<p>${t.replace(/\n/g, '<br>')}</p>`
    })
    .filter(Boolean)
    .join('\n')

  return html
}
