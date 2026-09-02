import hashlib
import json
import re

import pytest


CONTRACT = "contracts/CadenceAdjudicator.py"
CASE_ID = "a" * 64
PAYROLL = "0x" + ("1" * 40)
PAYER = "0x" + ("2" * 40)
PAYEE = "0x" + ("3" * 40)
PACKAGE_URL = "https://evidence.example/cadence/appeal.json"
SOURCE_URL = "https://evidence.example/cadence/agreement.txt"
BANT_URL = "https://evidence.example/cadence/bant.json"
BANT_SOURCE_URL = "https://evidence.example/cadence/payer-record.txt"
SOURCE_BODY = (
    "Signed statement of work: the payer engaged the payee through 30 September "
    "2026. Termination requires ten days written notice. The deliverable was "
    "accepted on 31 August 2026 and no notice was issued."
).encode()
BANT_SOURCE_BODY = b"Timestamped payer record describing the disputed delivery."
DELIVERABLES = "Deliver the signed integration, tests, and deployment notes."


def _sha(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def _package(
    *,
    source_url: str = SOURCE_URL,
    source_body: bytes = SOURCE_BODY,
    statement: str | None = None,
    requested_remedy: str = "continue_stream",
    source_type: str = "agreement",
) -> bytes:
    payload = {
        "statement": statement
        or (
            "The cancellation conflicts with the signed notice period and the "
            "payer already accepted the work covered by this stream."
        ),
        "requested_remedy": requested_remedy,
        "sources": [
            {
                "type": source_type,
                "url": source_url,
                "sha256": _sha(source_body),
                "description": "Signed agreement and acceptance record",
            }
        ],
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def _bant(*, case_id: str = CASE_ID, author: str = PAYER, deliverables: str = DELIVERABLES) -> bytes:
    payload = {
        "case_id": "0x" + case_id,
        "stream_id": "7",
        "payer": PAYER,
        "payee": PAYEE,
        "deliverables": deliverables,
        "messages": [
            {
                "author": author,
                "body": "The payer states the submitted work did not meet the agreed acceptance criteria.",
                "evidence": {
                    "type": "communication",
                    "url": BANT_SOURCE_URL,
                    "sha256": _sha(BANT_SOURCE_BODY),
                    "description": "Timestamped payer delivery record",
                },
            },
            {
                "author": PAYEE,
                "body": "The payee states the integration and tests were delivered and accepted.",
                "evidence": None,
            },
        ],
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def _verdict(
    *,
    appeal_upheld: bool = True,
    confidence: int = 91,
    reason_code: str = "CONTRACT_ENTITLEMENT_CONFIRMED",
    summary: str = "The signed terms and accepted work refute the cancellation basis.",
    findings: list[str] | None = None,
) -> str:
    return json.dumps(
        {
            "appeal_upheld": appeal_upheld,
            "confidence": confidence,
            "reason_code": reason_code,
            "summary": summary,
            "findings": findings
            or [
                "The agreement requires notice that the payer did not provide.",
                "The payer accepted the work tied to the active stream.",
            ],
        }
    )


@pytest.fixture()
def court(direct_vm, direct_deploy, direct_owner):
    direct_vm.sender = direct_owner
    return direct_deploy(CONTRACT)


def _file(
    direct_vm,
    court,
    sender,
    *,
    case_id: str = CASE_ID,
    package_body: bytes | None = None,
    package_url: str = PACKAGE_URL,
):
    body = package_body or _package()
    direct_vm.sender = sender
    court.file_appeal(
        case_id,
        5042002,
        PAYROLL,
        7,
        1,
        PAYER,
        PAYEE,
        1000000,
        3590000000,
        "INV-2026-091",
        "The payer alleges the engagement ended before all work was completed.",
        package_url,
        _sha(body),
    )
    return body


def _file_with_bant(direct_vm, court, sender, *, bant_body: bytes | None = None):
    package_body = _package()
    transcript = bant_body or _bant()
    direct_vm.sender = sender
    court.file_appeal_with_bant(
        CASE_ID,
        5042002,
        PAYROLL,
        7,
        1,
        PAYER,
        PAYEE,
        1000000,
        3590000000,
        "INV-2026-091",
        DELIVERABLES,
        "The payer alleges the engagement ended before all work was completed.",
        PACKAGE_URL,
        _sha(package_body),
        BANT_URL,
        _sha(transcript),
    )
    return package_body, transcript


def _mock_evidence(
    direct_vm,
    package_body: bytes,
    *,
    source_body: bytes = SOURCE_BODY,
    package_url: str = PACKAGE_URL,
    source_url: str = SOURCE_URL,
):
    direct_vm.mock_web(
        "^" + re.escape(package_url) + "$",
        {
            "status": 200,
            "body": package_body,
            "headers": {"content-type": "application/json"},
        },
    )
    direct_vm.mock_web(
        "^" + re.escape(source_url) + "$",
        {
            "status": 200,
            "body": source_body,
            "headers": {"content-type": "text/plain"},
        },
    )


def _mock_bant(direct_vm, transcript: bytes, source_body: bytes = BANT_SOURCE_BODY):
    direct_vm.mock_web(
        "^" + re.escape(BANT_URL) + "$",
        {
            "status": 200,
            "body": transcript,
            "headers": {"content-type": "application/json"},
        },
    )
    direct_vm.mock_web(
        "^" + re.escape(BANT_SOURCE_URL) + "$",
        {
            "status": 200,
            "body": source_body,
            "headers": {"content-type": "text/plain"},
        },
    )


def _adjudicate_upheld(direct_vm, court, package_body: bytes):
    _mock_evidence(direct_vm, package_body)
    direct_vm.mock_llm(
        r"(?s).*independent GenLayer validator adjudicating an appeal.*",
        _verdict(),
    )
    court.adjudicate(CASE_ID)


def test_initial_state_and_views(court):
    assert court.get_case_count() == 0
    assert court.get_case(CASE_ID) == {"exists": False}
    assert court.get_case("not-a-case") == {"exists": False}
    assert court.get_case_at(0) == {"exists": False}


def test_owner_can_set_relayer_and_non_owner_cannot(
    court, direct_vm, direct_owner, direct_alice, direct_bob
):
    direct_vm.sender = direct_owner
    court.set_relayer(direct_alice)
    assert court.relayer == direct_alice

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only the owner"):
        court.set_relayer(direct_bob)


def test_only_relayer_can_file(
    court, direct_vm, direct_alice, direct_owner
):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("configured relayer"):
        _file(direct_vm, court, direct_alice)

    _file(direct_vm, court, direct_owner)
    assert court.get_case_count() == 1


@pytest.mark.parametrize(
    ("override", "value", "message"),
    [
        ("case_id", "abcd", "case id"),
        ("payroll", "0x1234", "payroll contract"),
        ("payer", "0x1234", "payer"),
        ("payee", PAYER, "payer and payee"),
        ("reason", "too short", "cancellation reason"),
        ("package_url", "http://example.com/evidence.json", "https URL"),
        ("package_url", "https://127.0.0.1/evidence.json", "private host"),
        ("package_hash", "0x1234", "evidence hash"),
    ],
)
def test_file_validates_security_critical_inputs(
    court, direct_vm, direct_owner, override, value, message
):
    body = _package()
    values = {
        "case_id": CASE_ID,
        "payroll": PAYROLL,
        "payer": PAYER,
        "payee": PAYEE,
        "reason": "The payer alleges the engagement ended before all work was completed.",
        "package_url": PACKAGE_URL,
        "package_hash": _sha(body),
    }
    values[override] = value
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert(message):
        court.file_appeal(
            values["case_id"],
            5042002,
            values["payroll"],
            7,
            1,
            values["payer"],
            values["payee"],
            1000000,
            3590000000,
            "INV-2026-091",
            values["reason"],
            values["package_url"],
            values["package_hash"],
        )


def test_file_stores_arc_binding_and_prevents_duplicate(
    court, direct_vm, direct_owner
):
    _file(direct_vm, court, direct_owner)
    saved = court.get_case("0x" + CASE_ID.upper())

    assert saved["exists"] is True
    assert saved["case_id"] == CASE_ID
    assert saved["arc_chain_id"] == 5042002
    assert saved["payroll_contract"] == PAYROLL
    assert saved["stream_id"] == 7
    assert saved["cancellation_nonce"] == 1
    assert saved["payer"] == PAYER
    assert saved["payee"] == PAYEE
    assert saved["status"] == "filed"
    assert court.get_case_at(0)["case_id"] == CASE_ID

    with direct_vm.expect_revert("already exists"):
        _file(direct_vm, court, direct_owner)


def test_build_prompt_exposes_standard_and_prompt_injection_boundary(
    court, direct_vm, direct_owner
):
    _file(direct_vm, court, direct_owner)
    prompt = court.build_case_prompt(CASE_ID)
    assert "payee bears the burden of proof" in prompt
    assert "Uncertainty favors releasing" in prompt
    assert "UNTRUSTED_* blocks" in prompt
    assert PAYROLL in prompt
    assert PAYER in prompt
    assert PAYEE in prompt


def test_file_with_bant_stores_deliverables_and_transcript_binding(
    court, direct_vm, direct_owner
):
    _file_with_bant(direct_vm, court, direct_owner)
    saved = court.get_case(CASE_ID)

    assert saved["deliverables"] == DELIVERABLES
    assert saved["bant_uri"] == BANT_URL
    assert saved["bant_hash"]
    assert DELIVERABLES in court.build_case_prompt(CASE_ID)


def test_bant_transcript_binding_is_enforced(court, direct_vm, direct_owner):
    committed = _bant()
    package_body, _ = _file_with_bant(
        direct_vm, court, direct_owner, bant_body=committed
    )
    changed = _bant(author="0x" + ("9" * 40))
    _mock_evidence(direct_vm, package_body)
    _mock_bant(direct_vm, changed)
    direct_vm.mock_llm(r".*", _verdict())

    with direct_vm.expect_revert("hash does not match"):
        court.adjudicate(CASE_ID)


def test_bant_rejects_non_party_author_even_when_hash_matches(
    court, direct_vm, direct_owner
):
    transcript = _bant(author="0x" + ("9" * 40))
    package_body, _ = _file_with_bant(
        direct_vm, court, direct_owner, bant_body=transcript
    )
    _mock_evidence(direct_vm, package_body)
    _mock_bant(direct_vm, transcript)

    with direct_vm.expect_revert("author is invalid"):
        court.adjudicate(CASE_ID)


def test_adjudicate_uses_valid_bant_transcript(court, direct_vm, direct_owner):
    package_body, transcript = _file_with_bant(direct_vm, court, direct_owner)
    _mock_evidence(direct_vm, package_body)
    _mock_bant(direct_vm, transcript)
    direct_vm.mock_llm(
        r"(?s).*independent GenLayer validator adjudicating an appeal.*",
        _verdict(),
    )

    court.adjudicate(CASE_ID)

    saved = court.get_case(CASE_ID)
    expected_digest = _sha((_sha(package_body) + "|" + _sha(transcript)).encode())
    assert saved["status"] == "ruled"
    assert saved["evidence_digest"] == expected_digest


def test_adjudicate_upholds_strong_committed_evidence(
    court, direct_vm, direct_owner
):
    package_body = _file(direct_vm, court, direct_owner)
    _adjudicate_upheld(direct_vm, court, package_body)

    saved = court.get_case(CASE_ID)
    verdict = court.get_verdict(CASE_ID)
    assert saved["status"] == "ruled"
    assert saved["appeal_upheld"] is True
    assert saved["reason_code"] == "CONTRACT_ENTITLEMENT_CONFIRMED"
    assert saved["confidence"] == 91
    assert saved["evidence_digest"] == _sha(package_body)
    assert len(saved["verdict_hash"]) == 64
    assert verdict["ready"] is True
    assert verdict["verdict_hash"] == saved["verdict_hash"]
    assert direct_vm.run_validator() is True


def test_adjudicate_rejects_insufficient_evidence(
    court, direct_vm, direct_owner
):
    package_body = _file(direct_vm, court, direct_owner)
    _mock_evidence(direct_vm, package_body)
    direct_vm.mock_llm(
        r"(?s).*independent GenLayer validator adjudicating an appeal.*",
        _verdict(
            appeal_upheld=False,
            confidence=88,
            reason_code="INSUFFICIENT_EVIDENCE",
            summary="The source does not establish a continuing payment obligation.",
            findings=["The source does not materially answer the cancellation reason."],
        ),
    )
    court.adjudicate(CASE_ID)

    saved = court.get_case(CASE_ID)
    assert saved["appeal_upheld"] is False
    assert saved["reason_code"] == "INSUFFICIENT_EVIDENCE"


def test_low_confidence_yes_is_normalized_to_rejection(
    court, direct_vm, direct_owner
):
    package_body = _file(direct_vm, court, direct_owner)
    _mock_evidence(direct_vm, package_body)
    direct_vm.mock_llm(
        r"(?s).*independent GenLayer validator adjudicating an appeal.*",
        _verdict(confidence=69),
    )
    court.adjudicate(CASE_ID)

    saved = court.get_case(CASE_ID)
    assert saved["appeal_upheld"] is False
    assert saved["reason_code"] == "INSUFFICIENT_EVIDENCE"
    assert saved["confidence"] == 69


def test_package_hash_mismatch_cannot_create_verdict(
    court, direct_vm, direct_owner
):
    committed = _package()
    _file(direct_vm, court, direct_owner, package_body=committed)
    changed = _package(statement="A changed statement that no longer matches the Arc commitment. " * 2)
    _mock_evidence(direct_vm, changed)
    direct_vm.mock_llm(r".*", _verdict())

    with direct_vm.expect_revert("hash does not match"):
        court.adjudicate(CASE_ID)
    assert court.get_case(CASE_ID)["status"] == "filed"


def test_source_hash_mismatch_cannot_create_verdict(
    court, direct_vm, direct_owner
):
    package_body = _file(direct_vm, court, direct_owner)
    _mock_evidence(direct_vm, package_body, source_body=b"tampered source bytes")
    direct_vm.mock_llm(r".*", _verdict())

    with direct_vm.expect_revert("hash does not match"):
        court.adjudicate(CASE_ID)
    assert court.get_case(CASE_ID)["status"] == "filed"


@pytest.mark.parametrize(
    ("package_body", "message"),
    [
        (b"not-json", "valid UTF-8 JSON"),
        (
            json.dumps(
                {
                    "statement": "x" * 80,
                    "requested_remedy": "refund_payee",
                    "sources": [],
                }
            ).encode(),
            "requested remedy",
        ),
        (
            json.dumps(
                {
                    "statement": "x" * 80,
                    "requested_remedy": "continue_stream",
                    "sources": [],
                }
            ).encode(),
            "one to eight sources",
        ),
        (
            _package(source_type="rumor"),
            "source type",
        ),
        (
            _package(source_url="https://localhost/evidence.txt"),
            "private host",
        ),
    ],
)
def test_invalid_evidence_package_is_rejected_before_llm(
    court, direct_vm, direct_owner, package_body, message
):
    _file(direct_vm, court, direct_owner, package_body=package_body)
    direct_vm.mock_web(
        "^" + re.escape(PACKAGE_URL) + "$",
        {"status": 200, "body": package_body},
    )
    with direct_vm.expect_revert(message):
        court.adjudicate(CASE_ID)
    assert court.get_case(CASE_ID)["status"] == "filed"


def test_validator_rejects_opposite_binary_verdict(
    court, direct_vm, direct_owner
):
    package_body = _file(direct_vm, court, direct_owner)
    _adjudicate_upheld(direct_vm, court, package_body)

    direct_vm.clear_mocks()
    _mock_evidence(direct_vm, package_body)
    direct_vm.mock_llm(
        r"(?s).*independent GenLayer validator adjudicating an appeal.*",
        _verdict(
            appeal_upheld=False,
            confidence=90,
            reason_code="INCONCLUSIVE",
            summary="The evidence does not prove continuing entitlement.",
            findings=["The cancellation reason remains materially unresolved."],
        ),
    )
    assert direct_vm.run_validator() is False


def test_validator_rejects_changed_evidence_snapshot(
    court, direct_vm, direct_owner
):
    package_body = _file(direct_vm, court, direct_owner)
    _adjudicate_upheld(direct_vm, court, package_body)

    changed_source = SOURCE_BODY + b" changed"
    changed_package = _package(source_body=changed_source)
    direct_vm.clear_mocks()
    _mock_evidence(
        direct_vm,
        changed_package,
        source_body=changed_source,
    )
    direct_vm.mock_llm(
        r"(?s).*independent GenLayer validator adjudicating an appeal.*",
        _verdict(),
    )
    assert direct_vm.run_validator() is False


def test_cannot_adjudicate_twice(court, direct_vm, direct_owner):
    package_body = _file(direct_vm, court, direct_owner)
    _adjudicate_upheld(direct_vm, court, package_body)

    with direct_vm.expect_revert("not awaiting adjudication"):
        court.adjudicate(CASE_ID)


def test_pending_verdict_is_not_ready(court, direct_vm, direct_owner):
    _file(direct_vm, court, direct_owner)
    assert court.get_verdict(CASE_ID) == {
        "ready": False,
        "case_id": CASE_ID,
        "status": "filed",
    }
