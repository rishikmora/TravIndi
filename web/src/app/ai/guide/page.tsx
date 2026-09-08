"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Destination, type GuideAnswer } from "@/lib/api";

interface Exchange {
  question: string;
  answer: GuideAnswer;
}

function TouristGuideChat() {
  const { token } = useAuth();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    api.listDestinations().then((list) => {
      setDestinations(list);
      if (list.length > 0) setDestinationId(list[0].id);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !question.trim()) return;
    setError(null);
    setAsking(true);
    try {
      const answer = await api.askTouristGuide(
        { question, destination_id: destinationId || undefined },
        token
      );
      setExchanges((prev) => [...prev, { question, answer }]);
      setQuestion("");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not get an answer.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Tourist Guide</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Ask a question about a destination — answered by Claude, grounded only in
          TravIndi&apos;s own knowledge base for that destination. It will say so plainly if it
          doesn&apos;t know, rather than guess.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <select
          value={destinationId}
          onChange={(e) => setDestinationId(e.target.value)}
          className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
          rows={2}
          placeholder="e.g. What should I know before visiting?"
          className="rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={asking || !question.trim()}
          className="self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {asking ? "Thinking…" : "Ask"}
        </button>
      </form>

      <ul className="flex flex-col gap-4">
        {[...exchanges].reverse().map((ex, i) => (
          <li key={i} className="rounded border border-black/10 p-3 text-sm dark:border-white/15">
            <p className="font-medium">{ex.question}</p>
            <p className="mt-2 text-black/80 dark:text-white/80">{ex.answer.answer}</p>
            {ex.answer.sources.length > 0 && (
              <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                Sources: {ex.answer.sources.map((s) => s.document_title).join(", ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TouristGuidePage() {
  return (
    <RequireAuth>
      <TouristGuideChat />
    </RequireAuth>
  );
}
