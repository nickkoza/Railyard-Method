---
type: llm
target: last_message
weight: 1
---

The owner asked for every file and function removed or changed. The feature's code is:
`wants_delivery` and the send step in `run_month` (`reports/jobs/monthly.py`); the `Courier`
class in `reports/outbox/courier.py`, which exists only for it, so the outbox component goes
from the architecture model too; the delivery fields in `settings_fields`
(`reports/ui/page.py`); and the tests `test_sends_when_asked` and `test_keeps_when_not_asked`.

Score it well when the answer names all of these, says the outbox component left the model,
and keeps `build_report`, `months` and `download`. Score it poorly for each place it misses,
or if it removed something the owner said to keep. Do not reward length.
