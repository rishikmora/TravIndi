"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api } from "@/lib/api";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-medium">Translate text</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        required
        rows={3}
        placeholder="Text to translate"
        className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
      />
      <input
        value={targetLanguage}
        onChange={(e) => setTargetLanguage(e.target.value)}
        placeholder="Target language (e.g. Hindi, Tamil, French)"
        className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !text.trim()}
        className="self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Translating…" : "Translate"}
      </button>
      {translated && <p className="rounded bg-black/[.03] p-3 text-sm dark:bg-white/[.06]">{translated}</p>}
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-medium">Translate a menu or signboard photo</h2>
      <input type="file" accept="image/*" onChange={onFileChange} className="text-sm" />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Selected" className="max-h-48 rounded border border-black/10 object-contain dark:border-white/15" />
      )}
      <input
        value={targetLanguage}
        onChange={(e) => setTargetLanguage(e.target.value)}
        placeholder="Target language"
        className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !preview}
        className="self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Reading image…" : "Translate image"}
      </button>
      {translated && <p className="whitespace-pre-wrap rounded bg-black/[.03] p-3 text-sm dark:bg-white/[.06]">{translated}</p>}
    </form>
  );
}

function TranslatePanel() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Translate</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Real Claude-powered translation — text, or a photo of a menu/signboard using
          Claude&apos;s own vision capability. No voice or offline mode (needs speech/on-device
          infrastructure this prototype doesn&apos;t have).
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
