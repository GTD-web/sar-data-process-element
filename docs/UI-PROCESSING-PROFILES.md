# UI Specification — Processing Profile Management

> Covers **UC17–UC20** from [USECASE.md](./USECASE.md).

## Route

`/plan/profiles` · `/current/profiles`

## Purpose

Manage reusable processing profiles that define per-satellite, per-mode processing parameters.  
Profiles are automatically selected during JOB_INIT (CSU-08.02) and are essential for multi-satellite scalability (REQ-SCALE-002).

---

## Page Layout

### 1. Header Bar

| Element | Description |
|---------|-------------|
| Page title | "Processing Profiles" |
| **+ New Profile** button | Opens the creation dialog (Admin only) |
| Filter controls | Satellite dropdown, Mode dropdown, keyword search |

### 2. Profile List Table (UC17)

| Column | Description |
|--------|-------------|
| Name | Profile display name (link to detail) |
| Satellite | Lumir-X1 / X2 / X3 |
| Mode | SM / SC / SL |
| Polarization | HH, VV, HH+HV, VV+VH, Quad |
| Priority | 1 (highest) – 10 (lowest) |
| Referenced Pipelines | Count of pipelines using this profile |
| Created | Timestamp |
| Actions | Edit / Delete (Admin only) |

- Default sort: Satellite → Mode → Priority (ascending).
- Pagination: server-side, 20 rows per page.

### 3. Create / Edit Dialog (UC18, UC19)

**Trigger**: "+ New Profile" button (create) or "Edit" action (edit).

| Field | Type | Validation |
|-------|------|------------|
| Name | Text input | Required, max 100 chars, unique per satellite+mode |
| Satellite | Select | Required (Lumir-X1, X2, X3) |
| Mode | Select | Required (SM, SC, SL) |
| Polarization | Multi-select | At least one required |
| Priority | Number input | 1–10, default 5 |
| Processing Parameters | JSON editor / key-value form | Schema-validated |
| Description | Textarea | Optional, max 500 chars |

**Actions**: Save / Cancel.  
On save → refresh list, show success toast.

### 4. Delete Confirmation (UC20)

**Trigger**: "Delete" action on a profile row.

- If the profile is referenced by one or more pipelines, show a **blocking warning**:
  > "This profile is referenced by N pipeline(s). Remove or reassign them before deleting."
- If unreferenced, show a standard confirmation dialog:
  > "Delete profile '{name}'? This action cannot be undone."

---

## Role-Based Visibility

| Element | Admin | Operator |
|---------|-------|----------|
| Profile list (read) | Yes | Yes |
| + New Profile button | Yes | Hidden |
| Edit action | Yes | Hidden |
| Delete action | Yes | Hidden |

## API Endpoints (Expected)

| Action | Method | Path |
|--------|--------|------|
| List profiles | GET | `/v1/processing-profiles` |
| Create profile | POST | `/v1/processing-profiles` |
| Get profile | GET | `/v1/processing-profiles/{id}` |
| Update profile | PUT | `/v1/processing-profiles/{id}` |
| Delete profile | DELETE | `/v1/processing-profiles/{id}` |

## Related Use Cases

- UC17: Profile list → Profile List Table
- UC18: Profile creation → Create Dialog
- UC19: Profile edit → Edit Dialog
- UC20: Profile deletion → Delete Confirmation
