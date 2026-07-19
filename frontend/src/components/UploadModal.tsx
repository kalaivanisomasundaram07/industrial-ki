import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  X, CloudUpload, CheckCircle, AlertCircle, Loader2,
  FileText, FileSpreadsheet, Image, File
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadFile {
  id: string;
  file: File;
  status: "idle" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

interface Toast {
  docs: number;
  triples: number;
}

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACCEPTED_EXTS = [".pdf", ".docx", ".xlsx", ".txt", ".jpg", ".jpeg", ".png"];
const ACCEPTED_ATTR = ACCEPTED_EXTS.join(",");

const FORMAT_BADGES = ["PDF", "DOCX", "XLSX", "TXT", "JPG", "PNG"];

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf")
    return <FileText size={18} className="text-red-400 shrink-0" />;
  if (["docx", "doc"].includes(ext))
    return <FileText size={18} className="text-blue-400 shrink-0" />;
  if (["xlsx", "xls"].includes(ext))
    return <FileSpreadsheet size={18} className="text-green-400 shrink-0" />;
  if (["jpg", "jpeg", "png"].includes(ext))
    return <Image size={18} className="text-pink-400 shrink-0" />;
  return <File size={18} className="text-slate-400 shrink-0" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UploadModal({ open, onClose, onSuccess }: UploadModalProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever modal opens
  useEffect(() => {
    if (open) {
      setFiles([]);
      setDragging(false);
      setUploading(false);
      setDone(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const incoming: UploadFile[] = Array.from(fileList)
      .filter((f) => {
        const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
        return ACCEPTED_EXTS.includes(ext);
      })
      .map((f) => ({
        id: Math.random().toString(36).slice(2),
        file: f,
        status: "idle",
        progress: 0,
      }));
    setFiles((prev) => {
      // Deduplicate by name
      const existingNames = new Set(prev.map((p) => p.file.name));
      return [...prev, ...incoming.filter((f) => !existingNames.has(f.file.name))];
    });
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleUpload = async () => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setDone(false);

    // Mark all idle → uploading at 10%
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "idle" ? { ...f, status: "uploading", progress: 10 } : f
      )
    );

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f.file));

    // Animate progress to 60% while request is in flight
    const progressTimer = setInterval(() => {
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading" && f.progress < 60
            ? { ...f, progress: f.progress + 10 }
            : f
        )
      );
    }, 300);

    try {
      const res = await fetch("http://localhost:8000/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressTimer);
      const data = await res.json();

      if (res.ok) {
        // Animate to 100% then mark done
        setFiles((prev) =>
          prev.map((f) => ({ ...f, status: "done", progress: 100 }))
        );

        const { docs_processed, triples_committed, triples_queued } = data.ingested;
        setToast({ docs: docs_processed, triples: triples_committed + triples_queued });
        setDone(true);
        onSuccess?.();

        // Auto-close modal after 1.5s
        setTimeout(() => {
          onClose();
          // Show toast after modal closes
          setTimeout(() => setToast(null), 4000);
        }, 1500);
      } else {
        clearInterval(progressTimer);
        setFiles((prev) =>
          prev.map((f) => ({
            ...f,
            status: "error",
            progress: 0,
            error: data.detail || "Upload failed",
          }))
        );
      }
    } catch {
      clearInterval(progressTimer);
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          status: "error",
          progress: 0,
          error: "Network error",
        }))
      );
    } finally {
      setUploading(false);
    }
  };

  const idleFiles = files.filter((f) => f.status === "idle");
  const buttonLabel = uploading ? "Uploading..." : done ? "Done ✓" : "Upload & Ingest";

  if (!open && !toast) return null;

  return (
    <>
      {/* ── MODAL ─────────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ animation: "fadeIn 0.18s ease" }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal card */}
          <div
            className="relative z-10 w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-black/10"
            style={{ animation: "scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)" }}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-8 pt-8 pb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Upload Documents</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Files are saved and immediately ingested into the Knowledge Graph
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-8 pb-8 space-y-5">
              {/* ── Drop Zone ── */}
              <div
                className={`relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-8 py-10 text-center transition-all cursor-pointer select-none ${
                  dragging
                    ? "border-violet-500 bg-violet-50"
                    : "border-violet-400/40 bg-slate-50 hover:border-violet-500 hover:bg-violet-50/60"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
              >
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_ATTR}
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />

                <div
                  className={`p-4 rounded-2xl transition-colors ${
                    dragging ? "bg-violet-100" : "bg-slate-100"
                  }`}
                >
                  <CloudUpload
                    size={48}
                    className={`transition-colors ${
                      dragging ? "text-violet-600" : "text-violet-500"
                    }`}
                  />
                </div>

                <div>
                  <p className="text-lg font-semibold text-slate-800 leading-tight">
                    {dragging
                      ? "Release to add files"
                      : "Drop your industrial documents here"}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">or click to browse files</p>
                </div>

                {/* Format badges */}
                <div className="flex flex-wrap justify-center gap-2 mt-1">
                  {FORMAT_BADGES.map((fmt) => (
                    <span
                      key={fmt}
                      className="px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-mono border border-violet-200"
                    >
                      {fmt}
                    </span>
                  ))}
                </div>
              </div>

              {/* ── File List ── */}
              {files.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {files.map((f) => (
                    <div
                      key={f.id}
                      className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <FileTypeIcon name={f.file.name} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 font-medium truncate">
                            {f.file.name}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {fmtSize(f.file.size)}
                          </p>
                        </div>
                        {/* Status icon */}
                        {f.status === "done" && (
                          <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                        )}
                        {f.status === "error" && (
                          <AlertCircle size={16} className="text-rose-400 shrink-0" />
                        )}
                        {f.status === "uploading" && (
                          <Loader2 size={16} className="text-purple-400 animate-spin shrink-0" />
                        )}
                        {f.status === "idle" && (
                          <button
                            onClick={() => removeFile(f.id)}
                            className="text-slate-600 hover:text-rose-400 transition-colors cursor-pointer p-0.5"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {/* Progress bar (shows once upload starts) */}
                      {f.status !== "idle" && (
                        <div className="space-y-1">
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                f.status === "done"
                                  ? "bg-emerald-500"
                                  : f.status === "error"
                                  ? "bg-rose-500"
                                  : "bg-gradient-to-r from-purple-500 to-blue-500"
                              }`}
                              style={{ width: `${f.progress}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-mono">
                            <span
                              className={
                                f.status === "done"
                                  ? "text-emerald-400"
                                  : f.status === "error"
                                  ? "text-rose-400"
                                  : "text-purple-400"
                              }
                            >
                              {f.status === "done"
                                ? "✓ Ingested"
                                : f.status === "error"
                                ? f.error || "Failed"
                                : "Uploading..."}
                            </span>
                            <span className="text-slate-500">{f.progress}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Action Row ── */}
              <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-200">
                <p className="text-xs text-slate-500">
                  {files.length === 0
                    ? "No files selected"
                    : `${files.length} file${files.length !== 1 ? "s" : ""} selected`}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-200 hover:border-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={files.length === 0 || uploading || done}
                    className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold text-white transition-all ${
                      files.length === 0 || done
                        ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                        : uploading
                        ? "bg-gradient-to-r from-purple-700 to-blue-700 cursor-not-allowed"
                        : "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 cursor-pointer shadow-lg shadow-purple-900/30"
                    }`}
                  >
                    {uploading && <Loader2 size={14} className="animate-spin" />}
                    {buttonLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SUCCESS TOAST (bottom-right, slides in) ─────────────────────── */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-[60] flex items-start gap-3 bg-white border-l-4 border-green-500 rounded-xl px-5 py-4 shadow-xl min-w-[280px]"
          style={{ animation: "slideInRight 0.3s cubic-bezier(0.16,1,0.3,1)" }}
        >
          <CheckCircle size={20} className="text-green-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-800">
              ✓ {toast.docs} document{toast.docs !== 1 ? "s" : ""} ingested
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Knowledge Graph updated with {toast.triples} new triple
              {toast.triples !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      )}

      {/* ── Keyframe styles injected inline ─────────────────────────────── */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.94) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(40px) } to { opacity: 1; transform: translateX(0) } }
      `}</style>
    </>
  );
}
