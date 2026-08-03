// file-library-common.js
// Shared helpers for admin-files.html and file-library.html.
// Requires supabase-client.js to be loaded first.

const LIBRARY_BUCKET = "Application";
const LIBRARY_TABLE = "library_files";

const LIBRARY_CATEGORIES = [
  "Notes",
  "PDF Library",
  "Images",
  "Videos",
  "Audio",
  "Documents",
  "Spreadsheets",
  "Presentations",
  "Archives",
  "Other",
];

/** Human-readable file size, e.g. 1536000 -> "1.5 MB" */
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Classify a file into a broad "kind" based on MIME type and/or filename.
 * Returns one of: pdf, image, video, audio, word, excel, powerpoint, zip, text, other
 */
function getFileKind(mimeType, fileName) {
  const ext = (fileName || "").split(".").pop().toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (mime.startsWith("video/") || ["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "video";
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) return "audio";
  if (mime.includes("word") || ["doc", "docx"].includes(ext)) return "word";
  if (mime.includes("sheet") || mime.includes("excel") || ["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (mime.includes("presentation") || mime.includes("powerpoint") || ["ppt", "pptx"].includes(ext)) return "powerpoint";
  if (mime.includes("zip") || mime.includes("compressed") || ["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "zip";
  if (mime.startsWith("text/") || ["txt", "md"].includes(ext)) return "text";
  return "other";
}

/** Emoji icon for a file kind (works everywhere, no extra assets needed) */
function getFileIcon(kind) {
  const icons = {
    pdf: "📕",
    image: "🖼️",
    video: "🎬",
    audio: "🎵",
    word: "📄",
    excel: "📊",
    powerpoint: "📽️",
    zip: "🗜️",
    text: "📝",
    other: "📁",
  };
  return icons[kind] || icons.other;
}

/** Friendly label for a file kind */
function getFileKindLabel(kind) {
  const labels = {
    pdf: "PDF",
    image: "Image",
    video: "Video",
    audio: "Audio",
    word: "Word Document",
    excel: "Spreadsheet",
    powerpoint: "Presentation",
    zip: "Archive",
    text: "Text File",
    other: "File",
  };
  return labels[kind] || labels.other;
}

/** Get the public URL for a file stored in the library bucket */
async function getLibraryPublicUrl(path) {
  const supabase = await getSupabase();
  const { data } = supabase.storage.from(LIBRARY_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Sanitize a filename for safe use as a storage path segment */
function sanitizeFileName(name) {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_");
}

/** Basic HTML-escaping for user-provided text before inserting into innerHTML */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
