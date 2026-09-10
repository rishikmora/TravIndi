"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Destination, type GuideAnswer } from "@/lib/api";
import { ArrowRightIcon, CompassIcon, SparkleIcon } from "@/components/icons";

interface Exchange {
  question: string;
  answer: GuideAnswer | null;
  error?: string;
}

function TouristGuideChat() {
  const { token } = useAuth();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [asking, setAsking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listDestinations().then((list) => {
      setDestinations(list);
      if (list.length > 0) setDestinationId(list[0].id);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [exchanges, asking]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !question.trim()) return;
    const asked = question;
    setQuestion("");
    setAsking(true);
    try {
      const answer = await api.askTouristGuide({ question: asked, destination_id: destinationId || undefined }, token);
      setExchanges((prev) => [...prev, { question: asked, answer }]);
    } catch (err) {
      setExchanges((prev) => [
        ...prev,
        { question: asked, answer: null, error: isApiError(err) ? err.message : "Could not get an answer." },
      ]);
    } finally {
      setAsking(false);
    }
  }

  const selectedDestination = destinations.find((d) => d.id === destinationId);

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">AI Tourist Guide</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Grounded only in TravIndi&apos;s knowledge base — it says so plainly when it doesn&apos;t know, rather
            than guess.
          </p>
        </div>
        <select
          value={destinationId}
          onChange={(e) => setDestinationId(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl border border-border bg-surface p-4">
        {exchanges.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-foreground/50">
            <CompassIcon width={26} height={26} className="text-foreground/30" />
            <p className="text-sm">
              Ask anything about {selectedDestination?.name ?? "a destination"} — history, what to see, practical
              tips.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {exchanges.map((ex, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
                  {ex.question}
                </p>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-muted px-4 py-2 text-sm">
                  {ex.error ? (
                    <p className="text-danger">{ex.error}</p>
                  ) : (
                    <>
                      <p>{ex.answer?.answer}</p>
                      {ex.answer && ex.answer.sources.length > 0 && (
                        <p className="mt-1.5 flex items-center gap-1 text-xs text-foreground/45">
                          <SparkleIcon width={10} height={10} className="text-accent" />
                          {ex.answer.sources.map((s) => s.document_title).join(", ")}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {asking && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-surface-muted px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
          placeholder="e.g. What should I know before visiting?"
          className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="submit"
          disabled={asking || !question.trim()}
          className="flex items-center gap-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {asking ? "…" : <ArrowRightIcon width={16} height={16} />}
        </button>
      </form>
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
