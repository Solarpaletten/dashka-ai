'use client'

import { type ExtractedFile, downloadFile, downloadZip } from '@/lib/files'

interface Props {
  files:  ExtractedFile[]
  isDark: boolean
}

export default function FileBar({ files, isDark }: Props) {
  if (files.length === 0) return null

  const cls = isDark ? 'download-btn--dark' : 'download-btn--light'

  return (
    <div className="download-bar">
      {files.map((f, i) => (
        <button
          key={i}
          className={`download-btn ${cls}`}
          onClick={() => downloadFile(f)}
          title={`${f.lines} lines · ${f.size}`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span className="dl-filename">{f.filename}</span>
          <span className="dl-meta">{f.size}</span>
        </button>
      ))}

      {/* ZIP button when multiple files */}
      {files.length > 1 && (
        <button
          className={`download-btn download-btn--zip ${cls}`}
          onClick={() => downloadZip(files)}
          title={`Download all ${files.length} files as ZIP`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span className="dl-filename">Download all ({files.length})</span>
          <span className="dl-meta">.zip</span>
        </button>
      )}
    </div>
  )
}
