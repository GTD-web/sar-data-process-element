#pragma once

#ifdef _WIN32
#ifdef CatisTlm_EXPORTS
#define CATIS_API __declspec(dllexport)
#else
#define CATIS_API __declspec(dllimport)
#endif
#else
#define CATIS_API __attribute__((visibility("default")))
#endif

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  // ── Forward pipeline (CADU → H5) ─────────────────────────────────────────
  char workspace_path[512];
  char decryption_key[49];  // 24-byte Key 1 (Hex string, max 48 chars + null)
  char decryption_key2[49]; // 24-byte Key 2 (Hex string)
  char decryption_iv[17];   // 8-byte IV 1 (Hex string, max 16 chars + null)
  char decryption_iv2[17];  // 8-byte IV 2 (Hex string)
  char output_file_prefix[256];   // Base name for forward pipeline output files
  uint8_t lhcp_vcid;
  uint8_t rhcp_vcid;
  uint8_t enable_dummy_insertion; // 1 = Enable Gap Dummy Insertion, 0 = Disable
  uint8_t single_thread_mode;     // 1 = Single-Threaded, 0 = Multi-Threaded
  
  // Feature Toggles
  uint8_t enable_randomizer;      // 1 = Enable Derandomize/Randomize, 0 = Disable
  uint8_t enable_rs_fec;          // 1 = Enable Reed-Solomon Decode/Encode, 0 = Disable
  uint8_t enable_3des;            // 1 = Enable 3-DES Decryption/Encryption, 0 = Disable
  char aux_antenna_az_path[512];
  char aux_antenna_el_path[512];
  char aux_gps_hq_path[512];
  char aux_gps_lq_path[512];
  char aux_replica_path[512];
  char tm01_dir_name[64];
  char tm02_dir_name[64];

  // ── Reverse pipeline (H5 → CADU) — SrcGenerator tuning ──────────────────
  uint32_t src_chunk_size;  // HDF5 lines per batch read  (0 = default 256)
  uint32_t src_buf_size_mb; // output file buffer in MB   (0 = default 8)
  uint8_t
      src_no_double_buffer; // 1 = disable double-buffer, 0 = enable (default)
} CatisPipelineConfig;

CATIS_API void *Catis_CreatePipeline(const CatisPipelineConfig *config);

typedef void (*CatisProgressCallback)(int progress, const char *message);
CATIS_API void Catis_SetProgressCallback(void *handle,
                                         CatisProgressCallback cb);
CATIS_API int Catis_GetProgress(void *handle, int *out_progress);

CATIS_API int Catis_ExtractPayload(void *handle);
CATIS_API int Catis_DecryptPayload(void *handle);
CATIS_API int Catis_ProcessRangeLines(void *handle);
CATIS_API int Catis_ExportHDF5(void *handle, const char *pod_file_path);

CATIS_API void Catis_GetLastReport(void *handle, char *json_buf, int max_len);
CATIS_API void Catis_DestroyPipeline(void *handle);

// ── Reverse pipeline (H5 → CADU) ─────────────────────────────────────────────
CATIS_API int Catis_GenerateSrc(void *handle, const char *h5_path,
                                const char *src_path);
CATIS_API int Catis_SegmentSrc(void *handle, const char *src_path,
                               const char *src_m_path);
CATIS_API int Catis_EncryptPayload(void *handle, const char *src_m_path,
                                   const char *dsrc_m_path);
CATIS_API int Catis_EncodeCadu(void *handle, const char *src_m_path,
                               const char *cadu_path);

// Convenience: runs all three reverse steps in sequence
CATIS_API int Catis_H5ToCadu(void *handle, const char *h5_path,
                             const char *src_path, const char *src_m_path,
                             const char *cadu_path);

// Status Codes
#define CATIS_SUCCESS 0
#define CATIS_SUCCESS_WITH_WARNINGS 1
#define CATIS_ERR_WORKSPACE_NOT_FOUND -10
#define CATIS_ERR_SYNC_MARKER_INVALID -20
#define CATIS_ERR_DECRYPT_FAIL -30
#define CATIS_ERR_DISK_FULL -40
#define CATIS_ERR_H5_READ_FAIL -60
#define CATIS_ERR_ENCODE_FAIL -70

#ifdef __cplusplus
}
#endif
