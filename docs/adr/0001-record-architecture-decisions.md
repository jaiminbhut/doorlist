# 1. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

Decisions about structure, data and deployment get made early and then outlive the reasons for them. Months later, the code shows *what* was chosen but not *why*, or what else was considered.

## Decision

Significant decisions are written down as short Architecture Decision Records in `docs/adr/`, numbered in order. Each has a status, the context, the decision, and its consequences.

An ADR is not edited after it is accepted. If a decision changes, a new ADR supersedes it, and the old one's status points to the new one.

A pull request that makes a significant decision includes its ADR.

## Consequences

- Reviewers can see the reasoning in the same PR as the change.
- Reversing a decision is a visible act (a superseding ADR), not a quiet drift.
- There is a small writing cost on each significant change.
