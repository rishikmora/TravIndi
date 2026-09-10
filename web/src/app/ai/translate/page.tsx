"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { CopyIcon, GlobeTranslateIcon, ImageIcon } from "@/components/icons";

const COMMON_LANGUAGES = ["Hindi", "Tamil", "Bengali", "Telugu", "Marathi", "Kannada", "English", "French", "Spanish"];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function LanguagePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [customOpen, setCustomOpen] = useState(!COMMON_LANGUAGES.includes(value));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {COMMON_LANGUAGES.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => {
              onChange(lang);
              setCustomOpen(false);
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              !customOpen && value === lang ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground/60"
            }`}
          >
            {lang}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            customOpen ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground/60"
          }`}
        >
          Other…
        </button>
      </div>
      {customOpen && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a language"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // clipboard API can be unavailable — the text is already visible
          // on screen for manual copying.
        }
      }}
      className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground/60 hover:bg-surface-muted"
    >
      <CopyIcon width={11} height={11} />
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function TextTranslator() {
  const { token } = useAuth();
  const [text, setText] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("Hindi");
  const [translated, setTranslated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !text.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.translateText({ text, target_language: targetLanguage }, token);
      setTranslated(result.translated_text);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not translate this.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <GlobeTranslateIcon width={15} height={15} className="text-accent" />
        Translate text
      </h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        required
        rows={3}
        placeholder="Text to translate"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <LanguagePicker value={targetLanguage} onChange={setTargetLanguage} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !text.trim()}
        className="self-start rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Translating…" : "Translate"}
      </button>
      {translated && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-surface-muted p-3 text-sm">
          <p>{translated}</p>
          <CopyButton text={translated} />
        </div>
      )}
    </form>
  );
}

function ImageTranslator() {
  const { token } = useAuth();
  const [preview, setPreview] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [translated, setTranslated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setTranslated(null);
    const dataUrl = await readFileAsDataUrl(file);
    setPreview(dataUrl);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !preview) return;
    setError(null);
    setSubmitting(true);
    try {
      const [prefix, base64] = preview.split(",");
      const mediaType = prefix.match(/data:(.*);base64/)?.[1] ?? "image/jpeg";
      const result = await api.translateImage({ image_base64: base64, media_type: mediaType, target_language: targetLanguage }, token);
      setTranslated(result.translated_text);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not translate this image.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <ImageIcon width={15} height={15} className="text-accent" />
        Translate a menu or signboard photo
      </h2>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Selected" className="max-h-56 rounded-xl border border-border object-contain" />
      ) : (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border p-6 text-center text-sm text-foreground/50 hover:border-primary hover:text-primary">
          <ImageIcon width={22} height={22} />
          Tap to choose a photo
          <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
        </label>
      )}
      {preview && (
        <label className="text-xs font-medium text-primary underline">
          <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
          Choose a different photo
        </label>
      )}
      <LanguagePicker value={targetLanguage} onChange={setTargetLanguage} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !preview}
        className="self-start rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Reading image…" : "Translate image"}
      </button>
      {translated && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-surface-muted p-3 text-sm">
          <p className="whitespace-pre-wrap">{translated}</p>
          <CopyButton text={translated} />
        </div>
      )}
    </form>
  );
}

function TranslatePanel() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl">Translate</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Real Claude-powered translation — text, or a photo of a menu/signboard using Claude&apos;s own vision
          capability. No voice or offline mode in this prototype.
        </p>
      </div>
      <TextTranslator />
      <ImageTranslator />
    </div>
  );
}

export default function TranslatePage() {
  return (
    <RequireAuth>
      <TranslatePanel />
    </RequireAuth>
  );
}
