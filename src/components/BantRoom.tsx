"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Paperclip, Send, Loader2 } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { APPEAL_SOURCE_TYPES, type AppealSourceType } from "@/lib/appeals";
import { Modal } from "./Modal";

type Message = {
  id: string;
  authorAddress: string;
  body: string;
  evidenceUrl: string | null;
  evidenceType: string | null;
  evidenceDescription: string | null;
  evidenceHash: string | null;
  createdAt: string;
};

interface Props {
  caseId: string;
  onClose: () => void;
  onCompleted?: () => void;
}

const field =
  "w-full rounded-2xl border border-ink/10 bg-paper-warm px-3.5 py-3 text-sm text-ink placeholder-ink/30 focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/20";

function remainingLabel(closesAt: string | null, now: number): string {
  if (!closesAt) return "Opening";
  const seconds = Math.max(0, Math.floor((new Date(closesAt).getTime() - now) / 1000));
  if (seconds === 0) return "Closed";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m remaining`;
}

export function BantRoom({ caseId, onClose, onCompleted }: Props) {
  const { api } = useApi();
  const [messages, setMessages] = useState<Message[]>([]);
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<"loading" | "open" | "closed">("loading");
  const [body, setBody] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceType, setEvidenceType] = useState<AppealSourceType>("other");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function refresh() {
    try {
      const result = await api.getBantRoom(caseId);
      setMessages(result.messages);
      setClosesAt(result.room?.closesAt ?? null);
      setRoomStatus(result.room ? result.room.status : "loading");
      if (result.room?.status === "closed") onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the Bant room");
    }
  }

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), 5000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const closedByClock = useMemo(
    () => !!closesAt && new Date(closesAt).getTime() <= now,
    [closesAt, now]
  );
  const closed = roomStatus === "closed" || closedByClock;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (closed || body.trim().length < 1) return;
    setSending(true);
    setError(null);
    try {
      const result = await api.addBantMessage(caseId, {
        body: body.trim(),
        ...(evidenceUrl.trim()
          ? {
              evidenceUrl: evidenceUrl.trim(),
              evidenceType,
              evidenceDescription: evidenceDescription.trim(),
            }
          : {}),
      });
      setMessages((current) => [...current, result.message]);
      setBody("");
      setEvidenceUrl("");
      setEvidenceDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the message");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title="Bant room" onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-ink/10 pb-4">
          <div className="flex items-center gap-2 text-sm text-ink/65">
            <MessageSquare size={16} className="text-volt" />
            Case <span className="font-mono text-xs">{caseId.slice(0, 10)}…</span>
          </div>
          <span className={closed ? "text-xs text-ink/45" : "text-xs font-medium text-volt"}>
            {roomStatus === "loading" ? "Waiting for room" : remainingLabel(closesAt, now)}
          </span>
        </div>

        <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink/45">No evidence messages yet.</p>
          ) : (
            messages.map((message) => (
              <article key={message.id} className="border border-ink/10 bg-paper-warm p-3">
                <div className="flex items-center justify-between gap-3 text-[11px] text-ink/40">
                  <span className="font-mono">{message.authorAddress.slice(0, 8)}…{message.authorAddress.slice(-6)}</span>
                  <time>{new Date(message.createdAt).toLocaleString()}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/80">{message.body}</p>
                {message.evidenceUrl && (
                  <a
                    href={message.evidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-start gap-2 border-t border-ink/10 pt-3 text-xs text-volt hover:text-volt-bright"
                  >
                    <Paperclip size={13} className="mt-0.5 shrink-0" />
                    <span>
                      {message.evidenceDescription || "Attached evidence"}
                      <span className="mt-0.5 block break-all font-mono text-ink/45">{message.evidenceUrl}</span>
                    </span>
                  </a>
                )}
              </article>
            ))
          )}
        </div>

        {!closed && roomStatus === "open" && (
          <form onSubmit={send} className="space-y-3 border-t border-ink/10 pt-4">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              rows={4}
              placeholder="Explain how the cancellation does or does not match the agreed deliverables."
              className={field}
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="url"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="Optional public https evidence URL"
                className={field}
              />
              <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value as AppealSourceType)} className={field}>
                {APPEAL_SOURCE_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
              </select>
            </div>
            {evidenceUrl.trim() && (
              <input
                value={evidenceDescription}
                onChange={(e) => setEvidenceDescription(e.target.value)}
                placeholder="What does this evidence prove?"
                className={field}
                required
              />
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={sending || body.trim().length === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-volt py-3 text-sm font-medium text-white hover:bg-volt-bright disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Send evidence
            </button>
          </form>
        )}
        {closed && <p className="border-t border-ink/10 pt-4 text-sm text-ink/55">The Bant transcript is closed and has been frozen for GenLayer review.</p>}
        {roomStatus === "loading" && <p className="text-sm text-ink/50">The room will appear as soon as the Arc appeal confirmation is indexed.</p>}
      </div>
    </Modal>
  );
}
