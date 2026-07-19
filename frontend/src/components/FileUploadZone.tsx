import React, { useState, useRef, useCallback } from "react";
import { Upload, X, CheckCircle, AlertCircle, FileText, Image, File } from "lucide-react";

interface UploadedFile {
  name: string;
  size: number;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
}

interface Toast {
  message: string;
  type: "success" | "error";
}

interface FileUploadZoneProps {
  onIngestComplete?: (summary: string) => void;
}

const ACCEPTED = ".pdf,.docx,.xlsx,.txt,.jpg,.jpeg,.png";
const ACCEPTED_TYPES = ["PDF", "DOCX", "XLSX", "TXT", "JPG", "PNG"];

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png"].includes(ext)) return <Image size={14} className="text-pink-400" />;
  return <FileText size={14} className="text-indigo-400" />;
}

export default function FileUploadZone({ onIngestComplete }: FileUploadZoneProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
  };

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const newEntries: UploadedFile[] = Array.from(fileList).map((f) => ({
      name: f.name,
      size: f.size,
      status: "pending",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...newEntries]);
    uploadAll(fileList, newEntries);
  };

  const uploadAll = async (fileList: FileList, entries: UploadedFile[]) => {
    const formData = new FormData();
    Array.from(fileList).forEach((f) => formData.append("files", f));

    // Mark all as uploading
    setFiles((prev) =>
      prev.map((f) =>
        entries.find((e) => e.name === f.name)
          ? { ...f, status: "uploading", progress: 30 }
          : f
      )
    );

    try {
      // Simulate progress at 60%
      setTimeout(() => {
        setFiles((prev) =>
          prev.map((f) =>
            entries.find((e) => e.name === f.name) ? { ...f, progress: 60 } : f
          )
        );
      }, 600);

      const res = await fetch("http://localhost:8000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setFiles((prev) =>
          prev.map((f) =>
            entries.find((e) => e.name === f.name)
              ? { ...f, status: "done", progress: 100 }
              : f
          )
        );
        const { docs_processed, triples_committed, triples_queued } = data.ingested;
        const msg = `${docs_processed} document(s) ingested — ${triples_committed} triples committed, ${triples_queued} queued for review.`;
        showToast(msg, "success");
        onIngestComplete?.(msg);
      } else {
        setFiles((prev) =>
          prev.map((f) =>
            entries.find((e) => e.name === f.name) ? { ...f, status: "error", progress: 0 } : f
          )
        );
        showToast(`Upload failed: ${data.detail || "Unknown error"}`, "error");
      }
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) =>
          entries.find((e) => e.name === f.name) ? { ...f, status: "error", progress: 0 } : f
        )
      );
      showToast("Network error during upload.", "error");
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const fmtSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="w-full space-y-3">
      {/* Drop Zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer ${
          dragging
            ? "border-indigo-400 bg-indigo-950/30"
            : "border-slate-700 hover:border-indigo-600 bg-slate-900/20"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-2 pointer-events-none">
          <div className={`p-3 rounded-full ${dragging ? "bg-indigo-600/30" : "bg-slate-800"} transition-colors`}>
            <Upload size={20} className={dragging ? "text-indigo-400" : "text-slate-400"} />
          </div>
          <p className="text-sm font-medium text-slate-300">
            {dragging ? "Drop files here" : "Drag & drop documents or click to browse"}
          </p>
          <p className="text-xs text-slate-500">
            Accepted: {ACCEPTED_TYPES.join(", ")}
          </p>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {files.map((f) => (
            <div key={f.name} className="flex items-center gap-3 bg-slate-900/60 border border-slate-800 px-3 py-2 rounded-lg">
              <FileIcon name={f.name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-200 truncate font-mono">{f.name}</span>
                  <span className="text-[10px] text-slate-500 shrink-0">{fmtSize(f.size)}</span>
                </div>
                {f.status === "uploading" && (
                  <div className="mt-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
                {f.status === "done" && (
                  <div className="mt-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full w-full" />
                  </div>
                )}
              </div>
              {f.status === "done" && <CheckCircle size={14} className="text-emerald-400 shrink-0" />}
              {f.status === "error" && <AlertCircle size={14} className="text-rose-400 shrink-0" />}
              {(f.status === "pending" || f.status === "error") && (
                <button onClick={(e) => { e.stopPropagation(); removeFile(f.name); }} className="text-slate-600 hover:text-rose-400 transition-colors cursor-pointer">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-xs font-mono border animate-in fade-in ${
          toast.type === "success"
            ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/40"
            : "bg-rose-950/60 text-rose-300 border-rose-700/40"
        }`}>
          {toast.type === "success" ? <CheckCircle size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
