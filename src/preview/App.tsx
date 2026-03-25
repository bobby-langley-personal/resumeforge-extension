import { useState, useEffect } from 'react'

interface PreviewData {
  resumeText: string
  coverLetterText?: string
  company?: string
  jobTitle?: string
}

// ── Types (mirrored from ResumePDF.tsx) ──────────────────────────────────────
interface ParsedRole {
  title: string
  dates: string
  bulletPoints: string[]
}
interface ExperienceGroup {
  company: string
  location: string
  roles: ParsedRole[]
}
interface ParsedResume {
  header: { name: string; email: string; phone: string; location: string; linkedin: string }
  summary: string
  experience: ExperienceGroup[]
  skills: Array<{ category: string; items: string[] }>
  education: Array<{ institution: string; location: string; degree: string }>
}

// ── Parser (ported 1:1 from ResumePDF.tsx) ───────────────────────────────────
function looksLikeDateRange(s: string): boolean {
  return /(\d{4}|Present|Current)/i.test(s.trim())
}

function parseResumeText(resumeText: string): ParsedResume {
  const lines = resumeText.split('\n').map(l => l.trim()).filter(l => l)
  const parsed: ParsedResume = {
    header: { name: '', email: '', phone: '', location: '', linkedin: '' },
    summary: '',
    experience: [],
    skills: [],
    education: [],
  }
  let currentSection = ''
  let currentGroup: ExperienceGroup | null = null
  const summaryLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('NAME:'))     { parsed.header.name     = line.replace('NAME:', '').trim();     continue }
    if (line.startsWith('EMAIL:'))    { parsed.header.email    = line.replace('EMAIL:', '').trim();    continue }
    if (line.startsWith('PHONE:'))    { parsed.header.phone    = line.replace('PHONE:', '').trim();    continue }
    if (line.startsWith('LOCATION:')) { parsed.header.location = line.replace('LOCATION:', '').trim(); continue }
    if (line.startsWith('LINKEDIN:')) { parsed.header.linkedin = line.replace('LINKEDIN:', '').trim(); continue }
    if (line === 'SUMMARY:')    { currentSection = 'summary';    continue }
    if (line === 'EXPERIENCE:') { currentSection = 'experience'; continue }
    if (line === 'SKILLS:')     { currentSection = 'skills';     continue }
    if (line === 'EDUCATION:')  { currentSection = 'education';  continue }

    switch (currentSection) {
      case 'summary':
        summaryLines.push(line)
        break
      case 'experience': {
        if (line.includes(' | ')) {
          const parts = line.split(' | ')
          if (parts.length >= 3) {
            if (currentGroup) parsed.experience.push(currentGroup)
            currentGroup = {
              company: parts[0].trim(),
              location: parts[1].trim(),
              roles: [{ title: '', dates: parts.slice(2).join(' | ').trim(), bulletPoints: [] }],
            }
          } else if (parts.length === 2) {
            if (looksLikeDateRange(parts[1])) {
              if (currentGroup) {
                const last = currentGroup.roles[currentGroup.roles.length - 1]
                if (last && !last.title) {
                  last.title = parts[0].trim()
                  last.dates = parts[1].trim()
                } else {
                  currentGroup.roles.push({ title: parts[0].trim(), dates: parts[1].trim(), bulletPoints: [] })
                }
              }
            } else {
              if (currentGroup) parsed.experience.push(currentGroup)
              currentGroup = { company: parts[0].trim(), location: parts[1].trim(), roles: [] }
            }
          }
        } else if ((line.startsWith('•') || line.startsWith('-')) && currentGroup?.roles.length) {
          const lastRole = currentGroup.roles[currentGroup.roles.length - 1]
          lastRole.bulletPoints.push(line.replace(/^[•\-]\s*/, '').trim())
        } else if (currentGroup) {
          if (currentGroup.roles.length === 0) {
            currentGroup.roles.push({ title: line, dates: '', bulletPoints: [] })
          } else {
            const lastRole = currentGroup.roles[currentGroup.roles.length - 1]
            if (!lastRole.title) lastRole.title = line
          }
        }
        break
      }
      case 'skills':
        if (line.includes(':')) {
          const colonIdx = line.indexOf(':')
          parsed.skills.push({
            category: line.slice(0, colonIdx).trim(),
            items: line.slice(colonIdx + 1).split(',').map(s => s.trim()).filter(Boolean),
          })
        }
        break
      case 'education':
        if (line.includes(' | ')) {
          const [institution, location] = line.split(' | ', 2)
          const nextLine = lines[i + 1]
          parsed.education.push({ institution: institution.trim(), location: location.trim(), degree: nextLine?.trim() || '' })
          if (nextLine) i++
        } else if (parsed.education.length === 0) {
          parsed.education.push({ institution: line, location: '', degree: '' })
        }
        break
    }
  }
  parsed.summary = summaryLines.join(' ')
  if (currentGroup) parsed.experience.push(currentGroup)
  return parsed
}

// ── Styles (matching PDF values, converted pt → CSS pt) ──────────────────────
const S = {
  page: {
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: '10pt',
    lineHeight: 1.3,
    color: '#000000',
    backgroundColor: '#ffffff',
    padding: '54pt',
    width: '816px',
    minHeight: '1056px',
    boxSizing: 'border-box' as const,
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '16pt',
  },
  name: {
    fontSize: '20pt',
    fontWeight: 'bold',
    marginBottom: '12pt',
  },
  contact: {
    fontSize: '10pt',
    marginBottom: '3pt',
  },
  sectionTitle: {
    fontSize: '12pt',
    fontWeight: 'bold' as const,
    textTransform: 'uppercase' as const,
    borderBottom: '1px solid #000000',
    paddingBottom: '2pt',
    marginTop: '14pt',
    marginBottom: '5pt',
  },
  summaryText: {
    fontSize: '10pt',
    marginBottom: '5pt',
    textAlign: 'justify' as const,
  },
  experienceGroup: {
    marginBottom: '8pt',
  },
  companyLine: {
    fontSize: '10pt',
    fontWeight: 'bold' as const,
    marginBottom: '2pt',
  },
  jobHeader: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    marginBottom: '2pt',
  },
  jobTitle: {
    fontSize: '10pt',
    fontWeight: 'bold' as const,
  },
  jobDates: {
    fontSize: '10pt',
    fontStyle: 'italic' as const,
  },
  bullet: {
    fontSize: '10pt',
    marginBottom: '2pt',
    marginLeft: '12pt',
  },
  skillsRow: {
    fontSize: '10pt',
    marginBottom: '4pt',
    lineHeight: 1.3,
  },
  educationItem: {
    marginBottom: '6pt',
  },
  degree: {
    fontSize: '11pt',
    fontWeight: 'bold' as const,
  },
  institution: {
    fontSize: '10pt',
  },
}

// ── Resume document ───────────────────────────────────────────────────────────
function ResumeDocument({ resumeText, candidateName }: { resumeText: string; candidateName: string }) {
  const parsed = parseResumeText(resumeText)
  if (!parsed.header.name && candidateName) parsed.header.name = candidateName

  const contactParts = [
    parsed.header.location,
    parsed.header.phone,
    parsed.header.email,
    parsed.header.linkedin || 'LinkedIn: Not provided',
  ].filter(Boolean)

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.name}>{parsed.header.name || candidateName}</div>
        <div style={S.contact}>{contactParts.join(' | ')}</div>
      </div>

      {/* Summary */}
      {parsed.summary.trim() && (
        <>
          <div style={S.sectionTitle}>Summary</div>
          <div style={S.summaryText}>{parsed.summary}</div>
        </>
      )}

      {/* Experience */}
      {parsed.experience.length > 0 && (
        <>
          <div style={S.sectionTitle}>Experience</div>
          {parsed.experience.map((group, gi) => (
            <div key={gi} style={S.experienceGroup}>
              <div style={S.companyLine}>
                {group.company}{group.location ? ` | ${group.location}` : ''}
              </div>
              {group.roles.map((role, ri) => (
                <div key={ri} style={ri === 0 ? { marginBottom: '5pt' } : { marginTop: '3pt', marginBottom: '5pt' }}>
                  <div style={S.jobHeader}>
                    <span style={S.jobTitle}>{role.title}</span>
                    <span style={S.jobDates}>{role.dates}</span>
                  </div>
                  {role.bulletPoints.map((bullet, bi) => (
                    <div key={bi} style={S.bullet}>• {bullet}</div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* Skills */}
      {parsed.skills.length > 0 && (
        <>
          <div style={S.sectionTitle}>Skills</div>
          {parsed.skills.map((sg, i) => (
            <div key={i} style={S.skillsRow}>
              <strong>{sg.category}:</strong>{' '}{sg.items.join(', ')}
            </div>
          ))}
        </>
      )}

      {/* Education */}
      {parsed.education.length > 0 && (
        <>
          <div style={S.sectionTitle}>Education</div>
          {parsed.education.map((edu, i) => (
            <div key={i} style={S.educationItem}>
              <div style={S.degree}>{edu.degree}</div>
              <div style={S.institution}>
                {edu.institution}{edu.location ? ` | ${edu.location}` : ''}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── Cover letter document ─────────────────────────────────────────────────────
function CoverLetterDocument({ coverLetterText, candidateName, company, jobTitle }: {
  coverLetterText: string
  candidateName: string
  company?: string
  jobTitle?: string
}) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const paragraphs = coverLetterText
    .split('\n\n')
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .filter(p => !/^dear\b/i.test(p))

  const pageStyle = {
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: '12pt',
    lineHeight: 1.4,
    color: '#000000',
    backgroundColor: '#ffffff',
    padding: '72pt',
    width: '816px',
    minHeight: '1056px',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={pageStyle}>
      <div style={{ textAlign: 'right', marginBottom: '12pt' }}>{today}</div>
      <div style={{ marginBottom: '12pt' }}>
        {company && <div>{company}</div>}
        {jobTitle && <div>{jobTitle}</div>}
      </div>
      <div style={{ marginBottom: '12pt' }}>Dear Hiring Manager,</div>
      {paragraphs.map((p, i) => (
        <div key={i} style={{ marginBottom: '12pt', textAlign: 'justify' }}>{p}</div>
      ))}
      <div style={{ marginBottom: '48pt' }}>Sincerely,</div>
      <div>{candidateName}</div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function PreviewApp() {
  const [data, setData] = useState<PreviewData | null>(null)
  const [activeTab, setActiveTab] = useState<'resume' | 'cover'>('resume')

  useEffect(() => {
    chrome.storage.local.get('resumeforge_preview', (result) => {
      if (result.resumeforge_preview) {
        setData(result.resumeforge_preview as PreviewData)
      }
    })
  }, [])

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#9ca3af', fontFamily: 'sans-serif', fontSize: '14px' }}>Loading preview…</p>
      </div>
    )
  }

  // Extract candidate name from resume text
  const nameMatch = data.resumeText.match(/^NAME:\s*(.+)$/m)
  const candidateName = nameMatch?.[1]?.trim() ?? ''

  const hasCoverLetter = !!data.coverLetterText

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#e5e7eb' }}>
      {/* Header bar */}
      <div style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #d1d5db',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        position: 'sticky' as const,
        top: 0,
        zIndex: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>ResumeForge</span>
        {(data.jobTitle || data.company) && (
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
            {[data.jobTitle, data.company].filter(Boolean).join(' · ')}
          </span>
        )}
        {hasCoverLetter && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
            {(['resume', 'cover'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  backgroundColor: activeTab === tab ? '#111827' : 'transparent',
                  color: activeTab === tab ? '#ffffff' : '#6b7280',
                }}
              >
                {tab === 'resume' ? 'Resume' : 'Cover Letter'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Page */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0 64px' }}>
        <div style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
          {activeTab === 'resume' || !hasCoverLetter ? (
            <ResumeDocument resumeText={data.resumeText} candidateName={candidateName} />
          ) : (
            <CoverLetterDocument
              coverLetterText={data.coverLetterText!}
              candidateName={candidateName}
              company={data.company}
              jobTitle={data.jobTitle}
            />
          )}
        </div>
      </div>
    </div>
  )
}
