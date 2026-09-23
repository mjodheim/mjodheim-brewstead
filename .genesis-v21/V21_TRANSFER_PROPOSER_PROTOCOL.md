# Genesis RSI V21 — isolated Brewstead transfer repair proposer

Status: **FROZEN before any V21 proposer output or transfer-evaluator observation**.

This is the complete proposer-facing contract for one Brewstead transfer slot.

## Runtime and information boundary

Use:

- a fresh ChatGPT Temporary Chat;
- outside the Mira Genesis project;
- GPT-5.6 Sol;
- High thinking effort;
- only the exact supplied bundle.

Forbidden:

- web, URLs or GitHub;
- plugins/connectors/connected apps;
- saved memory or previous conversations;
- Mira Genesis project context;
- evaluator-only JUnit source;
- hidden/withheld transfer-evaluator results;
- another V21 attempt or slot;
- human candidate-specific implementation guidance.

The task bundle contains:

- exact defected Brewstead parent source archive;
- public Brewstead tests;
- one public symptom statement;
- exact task manifest;
- this protocol;
- mechanical output verifier.

The evaluator-only objective test is intentionally absent.

## Objective

Repair the supplied public symptom while preserving the rest of the application.

Do not infer or speculate about unseen evaluator implementation.
Work from the supplied defected source, public tests and public symptom only.

## Scope

You may modify exactly one production path:

the `allowed_source_path` recorded in `task-manifest.json`.

No test, build, workflow, dependency, resource, configuration or other production
file may be changed.

No rename is allowed.

Prefer the smallest causal repair.

## Output

Return exactly:

1. `proposal.patch`
2. `transcript.json`

No prose outside those files.

## Transcript contract

Schema:

`mira-genesis-rsi-v21-transfer-proposal-v1`

Top-level keys exactly:

- schema
- task_id
- campaign_slot_id
- parent_node_id
- parent_tree_digest
- host_commit
- task_manifest_sha256
- proposer_protocol_sha256
- proposal_patch_sha256
- intent
- rationale
- files_changed
- public_checks
- uncertainties
- information_boundary

`files_changed` must be a sorted unique list and must contain exactly the
allowed production source path.

`public_checks` is a sorted unique non-empty list of checks you actually ran
or mechanically inspected from the supplied bundle.

`uncertainties` is a sorted unique non-empty list. If you have no substantive
uncertainty, include a truthful statement such as
`"Evaluator-only objective is withheld by protocol."`

`information_boundary` exactly:

```json
{
  "used_only_supplied_bundle": true,
  "used_web_or_github": false,
  "used_saved_memory_or_previous_chats": false,
  "used_evaluator_only_test_source": false,
  "used_other_v21_attempt_or_slot_output": false,
  "used_human_candidate_specific_guidance": false
}
```

## Required bindings

Copy exactly from `task-manifest.json`:

- task_id
- campaign_slot_id
- parent_node_id
- parent_tree_digest
- host_commit

Compute and bind:

- SHA-256 of `task-manifest.json`;
- SHA-256 of this `V21_TRANSFER_PROPOSER_PROTOCOL.md`;
- SHA-256 of `proposal.patch`.

## Mechanical self-check

Before returning, run:

```
python3 VERIFY_OUTPUT.py proposal.patch transcript.json
```

Do not return until it prints exactly:

`GENESIS_RSI_V21_TRANSFER_OUTPUT=PASS`

The laboratory will independently apply the patch and run the frozen public
Brewstead guard. Passing this verifier does not guarantee acceptance if the
public guard fails.
