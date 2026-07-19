import React, { useCallback } from "react";
import { X, Download, ClipboardList } from "lucide-react";

interface ComplianceReportModalProps {
  markdown: string;
  onClose: () => void;
}

// ─── Lightweight markdown→JSX renderer ───────────────────────────────────────
// Handles: # h1, ## h2, ### h3, **bold**, bullet lists, | tables |, plain text
function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  const inlineFormat = (text: string, key: string | number): React.ReactNode => {
    // Bold: **text**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={key}>
        {parts.map((part, pi) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={pi} className="font-semibold text-slate-800">
              {part.slice(2, -2)}
            </strong>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines (add spacing via margin on siblings)
    if (!line.trim()) {
      i++;
      continue;
    }

    // H1
    if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={i} className="text-xl font-bold text-slate-800 mb-4 pb-2 border-b-2 border-purple-200 mt-2">
          {line.slice(2)}
        </h1>
      );
      i++;
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={i} className="text-base font-semibold text-purple-700 mt-6 mb-2">
          {line.slice(3)}
        </h2>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={i} className="text-sm font-semibold text-slate-700 mt-4 mb-1.5">
          {line.slice(4)}
        </h3>
      );
      i++;
      continue;
    }

    // Bullet list — collect consecutive bullet lines
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].startsWith("- ") || lines[i].startsWith("* "))
      ) {
        items.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="list-none space-y-1.5 mb-3">
          {items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="text-purple-500 mt-0.5 shrink-0">•</span>
              <span>{inlineFormat(item, ii)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Table — collect all pipe rows
    if (line.includes("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      // Separate header, divider, body
      const [headerLine, ...rest] = tableLines;
      const bodyLines = rest.filter((l) => !l.match(/^\|[-| :]+\|$/));

      const parseRow = (l: string) =>
        l
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c !== "");

      const headers = parseRow(headerLine);

      nodes.push(
        <div key={`tbl-${i}`} className="overflow-x-auto mb-4 rounded-lg border border-slate-200 shadow-sm">
          <table className="w-full border-collapse">
            <thead className="bg-purple-600 text-white">
              <tr>
                {headers.map((h, hi) => (
                  <th key={hi} className="px-4 py-3 text-left text-sm font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bodyLines.map((bl, bi) => (
                <tr key={bi} className="hover:bg-slate-50 transition-colors">
                  {parseRow(bl).map((cell, ci) => (
                    <td key={ci} className="px-4 py-3 text-sm text-slate-600">
                      {inlineFormat(cell, ci)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Regular paragraph
    nodes.push(
      <p key={i} className="text-slate-600 leading-relaxed mb-3 text-sm">
        {inlineFormat(line, i)}
      </p>
    );
    i++;
  }

  return nodes;
}

// ─── Blob download helper (does NOT navigate away from the app) ───────────────
function downloadMarkdown(content: string, filename = "compliance_report.md") {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export default function ComplianceReportModal({
  markdown,
  onClose,
}: ComplianceReportModalProps) {
  if (!markdown) return null;

  const handleDownload = useCallback(() => {
    downloadMarkdown(markdown);
  }, [markdown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div
        className="relative z-10 w-full max-w-3xl mx-4 flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <ClipboardList size={20} className="text-purple-600" />
            <h2 className="text-base font-bold text-slate-800">Compliance Audit Report</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            >
              <Download size={13} />
              Download .md
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable report content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {renderMarkdown(markdown)}
        </div>
      </div>
    </div>
  );
}
