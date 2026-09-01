# Cadence Cancellation Appeal Evidence Standard

Cadence uses GenLayer to decide one narrow question:

> Has the payee proved that the payer's cancellation is illegitimate under a
> continuing agreement, or based on a material factual error, strongly enough
> that the paused stream should resume on its original terms?

The payee bears the burden of proof. The unstreamed balance remains escrowed
while the appeal is pending. Uncertainty favors returning that balance to the
payer.

## Filing deadline

The payee must commit an appeal on Arc no later than 24 hours after the payer
requests cancellation. Filing at the exact deadline is valid. Filing after it
is not.

The Arc transaction stores:

- an HTTPS evidence-package URL;
- the SHA-256 hash of the exact package bytes; and
- a deterministic case ID tied to the Arc chain, payroll contract, stream ID,
  and cancellation nonce.

Changing the package after filing causes hash verification to fail.

## Evidence package

The committed URL must return UTF-8 JSON:

```json
{
  "statement": "Why the cancellation conflicts with the agreement or facts.",
  "requested_remedy": "continue_stream",
  "sources": [
    {
      "type": "agreement",
      "url": "https://example.com/immutable/agreement.txt",
      "sha256": "64 lowercase hex characters",
      "description": "Signed statement of work and termination clause"
    }
  ]
}
```

An appeal needs one to eight unique HTTPS sources. Each source is fetched by
the validators and must match its own SHA-256 commitment.

Supported source types are:

- `agreement`
- `work_product`
- `invoice`
- `communication`
- `acceptance_record`
- `payment_record`
- `identity_record`
- `other`

Text, JSON, and up to two committed images can be evaluated. Evidence must be
publicly reachable during adjudication and must not use local or private-network
URLs.

## Evidence that can uphold an appeal

Strong evidence directly connects the payer, payee, stream, and cancellation
reason. Examples include:

- a signed agreement or statement of work showing the obligation remains in
  force or requires notice that was not given;
- accepted deliverables or timestamped work product proving the disputed work
  was performed;
- an invoice tied to an agreed milestone, backed by acceptance or delivery
  records;
- authenticated communications where the payer confirms continuation,
  acceptance, or a materially different termination date;
- reliable payment, identity, or third-party records showing the payer's stated
  cancellation premise is false.

The evidence should identify the relevant obligation, date, parties, and how it
answers the payer's stated reason.

## Evidence that is insufficient

The following normally cannot reinstate a stream:

- the payee's unsupported statement by itself;
- inaccessible, mutable, or hash-mismatched files;
- screenshots or documents with no reliable connection to the parties or
  stream;
- unrelated proof that does not answer the cancellation reason;
- contradictory records that leave the underlying obligation uncertain;
- fabricated, altered, or prompt-injection content;
- dissatisfaction with cancellation where the payer retained a contractual
  right to cancel.

## Validator verdict

Validators return a binary verdict plus a reason, confidence score, summary,
and findings. A vote to uphold below 70 percent confidence is normalized to
`INSUFFICIENT_EVIDENCE`.

The Arc relay uses a canonical verdict hash containing:

- case ID;
- whether the appeal was upheld;
- reason code; and
- committed evidence digest.

The relay cannot alter stream parties, rate, escrow, or terms. It can only
deliver the finalized GenLayer outcome to the Arc escrow contract.
