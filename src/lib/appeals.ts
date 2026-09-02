export const APPEAL_SOURCE_TYPES = [
  "agreement",
  "work_product",
  "invoice",
  "communication",
  "acceptance_record",
  "payment_record",
  "identity_record",
  "other",
] as const;

export type AppealSourceType = (typeof APPEAL_SOURCE_TYPES)[number];

export interface AppealSourceInput {
  type: AppealSourceType;
  url: string;
  description: string;
}

export interface PreparedAppeal {
  caseId: `0x${string}`;
  evidenceUri: string;
  evidenceHash: `0x${string}`;
}

export interface AppealProgress {
  caseId: string;
  status: string;
  fileTxHash: string | null;
  adjudicationTxHash: string | null;
  relayTxHash: string | null;
  verdict: {
    appeal_upheld?: boolean;
    reason_code?: string;
    confidence?: number;
    summary?: string;
    findings?: string[];
    verdict_hash?: string;
  } | null;
  lastError: string | null;
}

export function isOpenCancellationStatus(status: number): boolean {
  return status === 1 || status === 2;
}
