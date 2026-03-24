import { FileText } from 'lucide-react'

export default function App() {
  return (
    <div className="w-64 bg-zinc-950 text-zinc-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-5 h-5 text-blue-400" />
        <span className="font-semibold text-sm">ResumeForge</span>
      </div>
      <p className="text-zinc-400 text-xs leading-relaxed">
        Click the extension icon to open the side panel and tailor your resume to any job posting.
      </p>
    </div>
  )
}
