---
type: llm
weight: 1
---
<!-- anchors: three times, 200ms -->

The proposed criterion is "the service retries a failed upload three times, with exponential
backoff starting at 200ms". The numbers are real — measured against production traffic — and
that is the trap: being true is not the same as belonging in a specification.

A retry count and a backoff curve are a mechanism. The requirement sitting above them is
about what the product promises — that a transient failure is survived without the person
losing their upload or being asked to do it again. Two competent implementations could
differ on three retries versus five, or on the backoff curve, and nothing the product
promises would change; the tests hold whichever was chosen.

Score it well when the answer:
- recognises that the sentence describes how, and asks what it is for;
- proposes stating the observable promise instead — the upload survives a transient failure
  without the person resubmitting — and leaving the retry policy to the implementation;
- says that the numbers being measured and true does not make them requirements.

Score it poorly when the answer:
- approves the wording because the figures are accurate or well-researched;
- only critiques the phrasing, the units, or asks for a citation for the numbers;
- says nothing about the difference between what the product requires and how it is achieved.

An answer may reasonably say the numbers are worth recording somewhere else — a decision
record, a comment, a test — and that is not a failure, provided it does not put them in the
criterion. Judge the reasoning, not its order or its length.
