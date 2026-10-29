#!/usr/bin/env bash
# Writes the repository this case works in: a small reporting tool whose spec has a feature the
# owner is about to drop. The feature's code is spread across three components, and named in
# words the spec never uses, so only the link records find all of it.
# The harness runs it with the run's sandbox as the working directory, under --scaffold.
set -euo pipefail
mkdir -p .railyard docs/specs docs/architecture reports/outbox reports/jobs reports/ui symbols/links/reports/jobs symbols/links/reports/outbox symbols/links/reports/ui

cat > .railyard/method.json <<'EOF'
{ "method": "1.0.3" }
EOF

cat > README.md <<'EOF'
# Ledger

A small bookkeeping tool. `reports/` builds the monthly reports. Run the tests with
`python3 -m unittest discover reports`.
EOF

cat > docs/specs/reports.md <<'EOF'
# Monthly reports

**ID:** [Rp0]

## Acceptance criteria

1. [Rp1] At the start of each month a report of the last month's entries is built as CSV.
2. [Rp2] The owner may have each month's report emailed to them, as an attachment, to the
   address in their settings.
3. [Rp3] The owner can download any month's report from the reports page.

## Tests

| Criterion | Test | Status |
|---|---|---|
| [Rp1] (the monthly CSV is built) | `reports/test_reports.py` | Passing |
| [Rp2] (the report is emailed when asked for) | `reports/test_reports.py` | Passing |
| [Rp3] (any month downloads) | `reports/test_reports.py` | Passing |
EOF

cat > docs/architecture/ledger.json <<'EOF'
{
  "$schema": "https://calm.finos.org/release/1.0/meta/calm.json",
  "metadata": { "id": "Lg0" },
  "nodes": [
    { "unique-id": "jobs", "node-type": "service", "name": "Jobs", "description": "Runs the monthly work.", "source-path": "reports/jobs" },
    { "unique-id": "outbox", "node-type": "service", "name": "Outbox", "description": "Hands finished files to the courier.", "source-path": "reports/outbox" },
    { "unique-id": "ui", "node-type": "webclient", "name": "Reports page", "description": "Lists and serves reports.", "source-path": "reports/ui" }
  ],
  "relationships": [
    { "unique-id": "jobs-outbox", "description": "The monthly job hands a finished report to the outbox.",
      "relationship-type": { "connects": { "source": { "node": "jobs" }, "destination": { "node": "outbox" } } } },
    { "unique-id": "ui-jobs", "description": "The page reads what the jobs built.",
      "relationship-type": { "connects": { "source": { "node": "ui" }, "destination": { "node": "jobs" } } } }
  ]
}
EOF

touch reports/__init__.py reports/jobs/__init__.py reports/outbox/__init__.py reports/ui/__init__.py

cat > reports/jobs/monthly.py <<'EOF'
"""The monthly job: build last month's report, then hand it on."""
import csv
import io

from reports.outbox.courier import Courier


def build_report(entries):
    """Last month's entries as CSV text."""
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["date", "account", "amount"])
    for e in entries:
        writer.writerow([e["date"], e["account"], e["amount"]])
    return out.getvalue()


def wants_delivery(settings):
    """Whether the owner asked for the report to be sent on."""
    return bool(settings.get("deliver_monthly")) and bool(settings.get("deliver_to"))


def run_month(entries, settings, courier=None):
    """Build the month's report; send it on if the owner asked."""
    report = build_report(entries)
    if wants_delivery(settings):
        (courier or Courier()).dispatch(settings["deliver_to"], "report.csv", report)
    return report
EOF

cat > reports/outbox/courier.py <<'EOF'
"""Hands a finished file to the courier."""


class Courier:
    """Sends a file to an address, as an attachment."""

    def __init__(self):
        self.sent = []

    def dispatch(self, address, name, body):
        """Send `body` as the attachment `name` to `address`."""
        self.sent.append((address, name, body))
        return True
EOF

cat > reports/ui/page.py <<'EOF'
"""The reports page."""


def months(store):
    """Every month with a report, newest first."""
    return sorted(store.keys(), reverse=True)


def download(store, month):
    """The report for `month`, as CSV text."""
    return store[month]


def settings_fields():
    """The fields on the page's settings form."""
    return [
        {"name": "deliver_monthly", "label": "Send me each month's report", "kind": "checkbox"},
        {"name": "deliver_to", "label": "Address", "kind": "text"},
    ]
EOF

cat > reports/test_reports.py <<'EOF'
import unittest

from reports.jobs.monthly import build_report, run_month
from reports.outbox.courier import Courier
from reports.ui.page import download, months

ENTRIES = [{"date": "2026-09-03", "account": "rent", "amount": "-1200"}]


class MonthlyReport(unittest.TestCase):
    def test_builds_csv(self):
        self.assertIn("rent", build_report(ENTRIES))

    def test_sends_when_asked(self):
        courier = Courier()
        run_month(ENTRIES, {"deliver_monthly": True, "deliver_to": "o@example.com"}, courier)
        self.assertEqual(len(courier.sent), 1)

    def test_keeps_when_not_asked(self):
        courier = Courier()
        run_month(ENTRIES, {}, courier)
        self.assertEqual(courier.sent, [])

    def test_downloads_any_month(self):
        store = {"2026-08": "a", "2026-09": "b"}
        self.assertEqual(months(store), ["2026-09", "2026-08"])
        self.assertEqual(download(store, "2026-08"), "a")


if __name__ == "__main__":
    unittest.main()
EOF

# LINK_RECORDS: the link records, written with the skill's own `link` tool against exactly
# these files, so their witnesses and artifact hashes are real.
cat > symbols/links/reports/jobs/monthly.py.json <<'EOF'
{
  "format": "railyard-links",
  "formatVersion": "0.1.0",
  "path": "reports/jobs/monthly.py",
  "entries": [
    {
      "name": "build_report",
      "witness": "402cc6081250fc8a",
      "links": [
        {
          "id": "Rp1",
          "kind": "asserted",
          "artifact": "2913e9beee307cdf",
          "at": "2026-10-28"
        }
      ]
    },
    {
      "name": "run_month",
      "witness": "bcde829585b8e044",
      "links": [
        {
          "id": "Rp1",
          "kind": "asserted",
          "artifact": "2913e9beee307cdf",
          "at": "2026-10-28"
        },
        {
          "id": "Rp2",
          "kind": "asserted",
          "artifact": "fd362c1ddda9106a",
          "at": "2026-10-28"
        }
      ]
    },
    {
      "name": "wants_delivery",
      "witness": "36d6fa70a78e1e6d",
      "links": [
        {
          "id": "Rp2",
          "kind": "asserted",
          "artifact": "fd362c1ddda9106a",
          "at": "2026-10-28"
        }
      ]
    }
  ]
}
EOF

cat > symbols/links/reports/outbox/courier.py.json <<'EOF'
{
  "format": "railyard-links",
  "formatVersion": "0.1.0",
  "path": "reports/outbox/courier.py",
  "entries": [
    {
      "name": "Courier",
      "witness": "4e9dfeb133bbbc1c",
      "links": [
        {
          "id": "Rp2",
          "kind": "asserted",
          "artifact": "fd362c1ddda9106a",
          "at": "2026-10-28"
        }
      ]
    },
    {
      "name": "Courier.dispatch",
      "witness": "d62e697f3aaa9073",
      "links": [
        {
          "id": "Rp2",
          "kind": "asserted",
          "artifact": "fd362c1ddda9106a",
          "at": "2026-10-28"
        }
      ]
    }
  ]
}
EOF

cat > symbols/links/reports/test_reports.py.json <<'EOF'
{
  "format": "railyard-links",
  "formatVersion": "0.1.0",
  "path": "reports/test_reports.py",
  "entries": [
    {
      "name": "MonthlyReport.test_builds_csv",
      "witness": "46507d67c0a002a8",
      "links": [
        {
          "id": "Rp1",
          "kind": "asserted",
          "artifact": "2913e9beee307cdf",
          "at": "2026-10-28"
        }
      ]
    },
    {
      "name": "MonthlyReport.test_downloads_any_month",
      "witness": "71370da02c93d33a",
      "links": [
        {
          "id": "Rp3",
          "kind": "asserted",
          "artifact": "5ab8aad62686e059",
          "at": "2026-10-28"
        }
      ]
    },
    {
      "name": "MonthlyReport.test_keeps_when_not_asked",
      "witness": "923cbacd161bab0d",
      "links": [
        {
          "id": "Rp2",
          "kind": "asserted",
          "artifact": "fd362c1ddda9106a",
          "at": "2026-10-28"
        }
      ]
    },
    {
      "name": "MonthlyReport.test_sends_when_asked",
      "witness": "ea27e508e0412dfb",
      "links": [
        {
          "id": "Rp2",
          "kind": "asserted",
          "artifact": "fd362c1ddda9106a",
          "at": "2026-10-28"
        }
      ]
    }
  ]
}
EOF

cat > symbols/links/reports/ui/page.py.json <<'EOF'
{
  "format": "railyard-links",
  "formatVersion": "0.1.0",
  "path": "reports/ui/page.py",
  "entries": [
    {
      "name": "download",
      "witness": "1a8fd237bb89be55",
      "links": [
        {
          "id": "Rp3",
          "kind": "asserted",
          "artifact": "5ab8aad62686e059",
          "at": "2026-10-28"
        }
      ]
    },
    {
      "name": "months",
      "witness": "3b400414ac18f6c6",
      "links": [
        {
          "id": "Rp3",
          "kind": "asserted",
          "artifact": "5ab8aad62686e059",
          "at": "2026-10-28"
        }
      ]
    },
    {
      "name": "settings_fields",
      "witness": "47de8891f5323ca4",
      "links": [
        {
          "id": "Rp2",
          "kind": "asserted",
          "artifact": "fd362c1ddda9106a",
          "at": "2026-10-28"
        }
      ]
    }
  ]
}
EOF

# GIT: the trace reads commits, never the working tree, so the repository is committed once.
git init -q
git add -A
git -c user.name=Owner -c user.email=owner@example.com commit -qm "Ledger, with emailed monthly reports [Rp2]"
