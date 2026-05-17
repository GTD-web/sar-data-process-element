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
    char workspace_path[512];
    char decryption_key[49];   // 24-byte Key 1 (Hex string, max 48 chars + null)
    char decryption_key2[49];  // 24-byte Key 2 (Hex string)
    char decryption_iv[17];    // 8-byte IV 1 (Hex string, max 16 chars + null)
    char decryption_iv2[17];   // 8-byte IV 2 (Hex string)
    uint8_t lhcp_vcid;
    uint8_t rhcp_vcid;
    uint8_t enable_dummy_insertion; // 1 = Enable Gap Dummy Insertion, 0 = Disable
    uint8_t single_thread_mode;     // 1 = Single-Threaded (std::execution::seq), 0 = Multi-Threaded (std::execution::par)
    char aux_antenna_az_path[512];
    char aux_antenna_el_path[512];
    char aux_gps_hq_path[512];
    char aux_gps_lq_path[512];
    char aux_replica_path[512];
    char tm01_dir_name[64];
    char tm02_dir_name[64];
} CatisPipelineConfig;

CATIS_API void* Catis_CreatePipeline(const CatisPipelineConfig* config);

typedef void (*CatisProgressCallback)(int progress, const char* message);
CATIS_API void Catis_SetProgressCallback(void* handle, CatisProgressCallback cb);
CATIS_API int Catis_GetProgress(void* handle, int* out_progress);

CATIS_API int Catis_ExtractPayload(void* handle);
CATIS_API int Catis_DecryptPayload(void* handle);
CATIS_API int Catis_ProcessRangeLines(void* handle);
CATIS_API int Catis_ExportHDF5(void* handle, const char* pod_file_path);

CATIS_API void Catis_GetLastReport(void* handle, char* json_buf, int max_len);
CATIS_API void Catis_DestroyPipeline(void* handle);

// Status Codes
#define CATIS_SUCCESS 0
#define CATIS_SUCCESS_WITH_WARNINGS 1
#define CATIS_ERR_WORKSPACE_NOT_FOUND -10
#define CATIS_ERR_SYNC_MARKER_INVALID -20
#define CATIS_ERR_DECRYPT_FAIL -30
#define CATIS_ERR_DISK_FULL -40

#ifdef __cplusplus
}
#endif
