# UI Specification — Alert Management

> Covers **UC38–UC39** from [USECASE.md](./USECASE.md).

## Route

`/plan/alerts` · `/current/alerts`

## Purpose

Monitor and acknowledge operational alerts dispatched by the system (CSU-08.07).  
Alerts notify operators of failures, delays, quality issues, and resource thresholds that require attention.

---

## Alert Types

| Type | Description | Severity |
|------|-------------|----------|
| `MAX_RETRY` | Job exceeded maximum retry count (3 attempts, REQ-AVAIL-002) | Critical |
| `PIPELINE_DELAY` | Job processing time approaching or exceeding SLA (14,400s, REQ-PERF-001) | Warning |
| `QUALITY_FAIL` | Product quality validation failed (NESZ, PSLR, geometric, radiometric) | Warning |
| `RESOURCE_THRESHOLD` | System resource utilization exceeded threshold | Critical |

---

## Page Layout

### 1. Header Bar

| Element | Description |
|---------|-------------|
| Page title | "Alerts" |
| Unacknowledged count | Badge showing number of unacknowledged alerts |
| Filter controls | Status (Unacknowledged / Acknowledged / All), Type, Severity, Date range |
| **Acknowledge All** button | Bulk acknowledge visible filtered alerts |

### 2. Alert List (UC38)

| Column | Description |
|--------|-------------|
| Severity icon | Color-coded: red (Critical), yellow (Warning) |
| Type | MAX_RETRY / PIPELINE_DELAY / QUALITY_FAIL / RESOURCE_THRESHOLD |
| Message | Human-readable summary of the alert |
| Related Entity | Job ID or Pipeline ID (clickable link) |
| Timestamp | When the alert was dispatched |
| Status | Unacknowledged / Acknowledged |
| Acknowledged By | Username (if acknowledged) |
| Actions | Acknowledge (if unacknowledged) |

- Default filter: **Unacknowledged only**.
- Default sort: Timestamp (newest first), Critical before Warning at same time.
- Pagination: server-side, 30 rows per page.
- Empty state (unacknowledged): "No unacknowledged alerts. All clear."

### 3. Alert Detail Expandable Row

**Trigger**: Click on an alert row to expand inline.

| Field | Description |
|-------|-------------|
| Full message | Complete alert description |
| Related Job | Link to Job detail (opens in Console page) |
| Related Pipeline | Link to Pipeline (opens in Console page) |
| Alert metadata | Raw key-value pairs from the alert payload |
| Dispatch time | ISO 8601 timestamp |
| Acknowledge time | If acknowledged, when and by whom |

### 4. Acknowledge Action (UC39)

**Single acknowledge**: Click "Acknowledge" button on an alert row.

- Sends `PATCH /v1/alerts/{id}/acknowledge`.
- Uses optimistic concurrency control: includes `If-Match` header with the alert's ETag.
- On **409 Conflict** (ETag mismatch): show warning "This alert was modified by another user. Refreshing..." and reload the list.
- On success: move alert to "Acknowledged" state, show brief toast.

**Bulk acknowledge**: Click "Acknowledge All" in the header.

- Confirmation dialog: "Acknowledge N alerts? This marks them as reviewed."
- Sends batch request for all currently filtered unacknowledged alerts.
- On partial failure: show count of failed items and refresh list.

---

## Notification Badge (Global)

A small badge on the "Alerts" navigation item shows the count of unacknowledged alerts.

- Polled every 30 seconds or updated via WebSocket (if available).
- Visible on all pages in the sidebar navigation.
- Badge color: red if any Critical alerts exist, yellow if only Warning.

---

## Role-Based Visibility

| Element | Admin | Operator |
|---------|-------|----------|
| Alert list (read) | Yes | Yes |
| Acknowledge (single) | Yes | Yes |
| Acknowledge All (bulk) | Yes | Yes |

## API Endpoints (Expected)

| Action | Method | Path |
|--------|--------|------|
| List alerts | GET | `/v1/alerts` |
| Get alert | GET | `/v1/alerts/{id}` |
| Acknowledge alert | PATCH | `/v1/alerts/{id}/acknowledge` |
| Bulk acknowledge | POST | `/v1/alerts/acknowledge-bulk` |
| Unacknowledged count | GET | `/v1/alerts/unacknowledged-count` |

## Related Use Cases

- UC38: Alert list → Alert List + Filter controls
- UC39: Acknowledge → Acknowledge Action (single + bulk)
