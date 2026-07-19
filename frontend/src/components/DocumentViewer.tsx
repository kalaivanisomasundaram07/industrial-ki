import React, { useState, useEffect, useCallback } from "react";
import {
  X, ChevronLeft, ChevronRight, FileText, FileSpreadsheet, File,
  Download, Copy, Check
} from "lucide-react";

export interface CitationInfo {
  filename: string;
  page_number: number;
  chunk_index: number;
  chunk_text: string;
  doc_type: string;
}

interface DocumentViewerProps {
  citation: CitationInfo | null;
  onClose: () => void;
}

function getFileExt(filename: string): string {
  return (filename.split(".").pop() ?? "").toLowerCase();
}

function isPDF(filename: string) {
  return getFileExt(filename) === "pdf";
}

function FileIcon({ filename, size = 20 }: { filename: string; size?: number }) {
  const ext = getFileExt(filename);
  if (ext === "pdf")
    return <FileText size={size} className="text-red-500 shrink-0" />;
  if (["docx", "doc"].includes(ext))
    return <FileText size={size} className="text-blue-500 shrink-0" />;
  if (["xlsx", "xls"].includes(ext))
    return <FileSpreadsheet size={size} className="text-green-600 shrink-0" />;
  return <File size={size} className="text-slate-400 shrink-0" />;
}

export default function DocumentViewer({ citation, onClose }: DocumentViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [iframeKey, setIframeKey] = useState(0);
  const [copied, setCopied] = useState(false);

  // Blob-based download — never navigates the page away
  const handleDownload = useCallback(async () => {
    if (!citation) return;
    try {
      const response = await fetch(
        `http://localhost:8000/document/${encodeURIComponent(citation.filename)}`
      );
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = citation.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  }, [citation]);

  // Reset page when citation changes
  useEffect(() => {
    if (citation) {
      setCurrentPage(citation.page_number || 1);
      setIframeKey((k) => k + 1);
    }
  }, [citation?.filename, citation?.page_number]);

  // Close on Escape
  useEffect(() => {
    if (!citation) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [citation, onClose]);

  const handlePrev = useCallback(() => {
    setCurrentPage((p) => {
      const next = Math.max(1, p - 1);
      setIframeKey((k) => k + 1);
      return next;
    });
  }, []);

  const handleNext = useCallback(() => {
    setCurrentPage((p) => {
      const next = p + 1;
      setIframeKey((k) => k + 1);
      return next;
    });
  }, []);

  const handleCopy = useCallback(() => {
    if (!citation || !citation.chunk_text) return;
    navigator.clipboard.writeText(citation.chunk_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [citation]);

  if (!citation) return null;

  const documentUrl = `http://localhost:8000/document/${encodeURIComponent(citation.filename)}`;
  // The #page fragment instructs the PDF viewer plugin to scroll to the right page
  const pdfUrlWithPage = `${documentUrl}#page=${currentPage}`;
  const isPdf = isPDF(citation.filename);

  // Extract search hint: first 5 words
  const searchHint = citation.chunk_text
    ? citation.chunk_text.trim().split(/\s+/).slice(0, 5).join(" ")
    : "";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ animation: "fade-in 0.15s ease" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-6xl mx-4 h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        style={{ animation: "viewer-in 0.22s cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <FileIcon filename={citation.filename} size={20} />
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 text-sm truncate max-w-xs sm:max-w-md">
                {citation.filename}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-mono font-bold border border-violet-200">
                  Page {currentPage}
                </span>
                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wide">
                  {citation.doc_type}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Page navigation — only for PDFs */}
            {isPdf && (
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1">
                <button
                  onClick={handlePrev}
                  disabled={currentPage <= 1}
                  className="p-1 rounded text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Previous page"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs font-mono text-slate-600 px-1 whitespace-nowrap">
                  Page {currentPage}
                </span>
                <button
                  onClick={handleNext}
                  className="p-1 rounded text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Next page"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}

            {/* Download button — blob approach, never navigates away */}
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-800 transition-colors cursor-pointer"
              title="Download file"
            >
              <Download size={13} />
              Download
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title="Close viewer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Document Area (Two-Panel Layout) ── */}
        <div className="flex-1 flex overflow-hidden bg-slate-100">
          {/* Left Panel: 65% width */}
          <div className="w-[65%] h-full bg-white border-r border-slate-200 relative">
            {isPdf ? (
              <iframe
                key={iframeKey}
                src={pdfUrlWithPage}
                title={citation.filename}
                width="100%"
                height="100%"
                style={{ border: "none" }}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <FileIcon filename={citation.filename} size={48} />
                <p className="mt-4 font-semibold text-slate-700">Preview not available for this document type</p>
                <p className="text-xs text-slate-400 mt-1">Please download the document to view the full content.</p>
                <button
                  onClick={handleDownload}
                  className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors cursor-pointer"
                >
                  <Download size={13} />
                  Download Document
                </button>
              </div>
            )}
          </div>

          {/* Right Panel: 35% width */}
          <div className="w-[35%] h-full bg-slate-50 flex flex-col overflow-y-auto p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Relevant Text Segment
            </h3>

            {/* Amber Highlight Box */}
            <div className="bg-amber-50 border border-amber-200 text-amber-950 rounded-xl p-4 shadow-sm mb-4">
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                {citation.chunk_text || "No content available for this chunk."}
              </p>
            </div>

            {/* Search hint */}
            {searchHint && (
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-start gap-3 text-slate-600 mb-4 shadow-sm">
                <div className="p-1 rounded bg-slate-100 text-slate-600 shrink-0 select-none">
                  <kbd className="text-[10px] font-mono font-bold">Ctrl+F</kbd>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Ctrl+F Search Hint (First 5 words)
                  </p>
                  <p className="text-xs text-slate-700 mt-1 font-mono select-all bg-slate-50 border border-slate-100 px-2 py-1 rounded" title="Double click to select">
                    {searchHint}
                  </p>
                </div>
              </div>
            )}

            {/* Copy Button */}
            <button
              onClick={handleCopy}
              className={`flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                copied
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
              }`}
            >
              {copied ? (
                <>
                  <Check size={14} className="text-emerald-600" />
                  Copied to Clipboard
                </>
              ) : (
                <>
                  <Copy size={14} className="text-slate-500" />
                  Copy Excerpt Text
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
