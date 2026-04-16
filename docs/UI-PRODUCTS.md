# UI Specification — Product Management

> Covers **UC27–UC32** from [USECASE.md](./USECASE.md).

## Route

`/plan/products` · `/current/products`

## Purpose

Browse, inspect, and download processed SAR products registered in the STAC catalog (CSU-02).  
Provides quality validation results, thumbnails, and reprocessing capabilities.

---

## Page Layout

### 1. Header Bar

| Element | Description |
|---------|-------------|
| Page title | "Products" |
| Filter controls | Level (L0–L3), Satellite, Mode, Status, Date range |
| Search | scene_id or product_id keyword search |

### 2. Product List Table (UC27)

| Column | Description |
|--------|-------------|
| Product ID | Unique identifier (link to detail panel) |
| Scene ID | Source scene identifier |
| Level | LEVEL_0 / LEVEL_1 / LEVEL_2 / LEVEL_3 |
| Satellite | Lumir-X1 / X2 / X3 |
| Mode | SM / SC / SL |
| Status | COMPLETED / FAILED / PROCESSING |
| Created | Timestamp |
| Actions | View / Download / Reprocess |

- Default sort: Created (descending).
- Pagination: server-side, 20 rows per page.
- Empty state: "No products match the current filters."

### 3. Product Detail Panel (UC28)

**Trigger**: Click product row or "View" action.  
Opens as a **slide-over panel** on the right side.

#### Metadata Section

| Field | Description |
|-------|-------------|
| Product ID | — |
| Scene ID | — |
| Level | Processing level |
| Satellite / Mode | — |
| Polarization | HH, VV, etc. |
| Spatial Extent | Bounding box (WGS84) — displayed on a mini-map |
| Temporal Extent | Acquisition start / end |
| Resolution | Ground range / azimuth (meters) |
| Processing Time | Total elapsed time |
| Job ID | Link to associated job |

#### Thumbnail Preview (UC31)

- Quick-look thumbnail image (GET `/v1/products/{id}/thumbnail`).
- Click to expand in a lightbox overlay.
- Fallback: "No preview available" placeholder.

#### Quality Validation (UC29)

| Metric | Value | Status |
|--------|-------|--------|
| NESZ | dB value | Pass / Fail |
| PSLR | dB value | Pass / Fail |
| Geometric Accuracy | meters | Pass / Fail |
| Radiometric Calibration | — | Pass / Fail |

- Color-coded: green (Pass), red (Fail).
- Source: CSU-07.02, REQ-FUNC-023.

#### Actions

| Action | Description | Role |
|--------|-------------|------|
| Download (UC30) | Generate presigned URL with expiry, open in new tab | Admin, Operator |
| Reprocess (UC32) | Open reprocess dialog | Admin, Operator |

### 4. Download Flow (UC30)

1. User clicks "Download".
2. Frontend calls `GET /v1/products/{id}/download-url`.
3. Receives presigned URL with expiration time.
4. Show toast: "Download link generated (expires in N minutes)" and open URL in new tab.

### 5. Reprocess Dialog (UC32)

**Trigger**: "Reprocess" button on product detail or list action.

| Field | Type | Description |
|-------|------|-------------|
| Scene ID | Read-only | Pre-filled from the product |
| Target Level | Select | LEVEL_1, LEVEL_2, LEVEL_3 (must be >= current level) |
| Confirmation | Checkbox | "I understand this will create a new Job" |

**On submit**:
- Calls ICD OPS-06 / SI-07 to trigger reprocessing.
- CSC-08 reconstructs the DAG from the specified level.
- Show success toast with the new Job ID (link to Job detail).

---

## Role-Based Visibility

| Element | Admin | Operator |
|---------|-------|----------|
| Product list (read) | Yes | Yes |
| Product detail (read) | Yes | Yes |
| Download | Yes | Yes |
| Reprocess | Yes | Yes |

## API Endpoints (Expected)

| Action | Method | Path |
|--------|--------|------|
| List products | GET | `/v1/products` |
| Get product | GET | `/v1/products/{id}` |
| Get thumbnail | GET | `/v1/products/{id}/thumbnail` |
| Get download URL | GET | `/v1/products/{id}/download-url` |
| Reprocess | POST | `/v1/products/{id}/reprocess` |

## Related Use Cases

- UC27: Product list → Product List Table
- UC28: Product detail → Product Detail Panel (metadata)
- UC29: Quality validation → Quality Validation section
- UC30: Download → Download Flow
- UC31: Thumbnail → Thumbnail Preview
- UC32: Reprocess → Reprocess Dialog
