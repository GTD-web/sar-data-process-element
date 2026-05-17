#include "catis_tlm/catis_telemetry.h"
#include <iostream>
#include <string>
#include <string>
#include <chrono>
#include <thread>
#include <atomic>

#define USE_POLLING 0

void progress_callback(int progress, const char* message) {
    std::cout << "[PROGRESS " << progress << "%] " << message << std::endl;
}

int main() {
    std::cout << "Starting CATIS Level-0 Processor Pipeline..." << std::endl;

    CatisPipelineConfig config = {};
    // Setup dummy workspace
    snprintf(config.workspace_path, sizeof(config.workspace_path), "d:/projects/postprocess/CATIS/workspace");
    snprintf(config.decryption_key, sizeof(config.decryption_key), "0123456789ABCDEF");
    config.lhcp_vcid = 4;
    config.rhcp_vcid = 5;

    // Hardcode aux paths for the generated binary files
    snprintf(config.aux_antenna_az_path, sizeof(config.aux_antenna_az_path), "d:/projects/postprocess/CATIS/workspace/antenna_az.bin");
    snprintf(config.aux_antenna_el_path, sizeof(config.aux_antenna_el_path), "d:/projects/postprocess/CATIS/workspace/antenna_el.bin");
    snprintf(config.aux_gps_hq_path, sizeof(config.aux_gps_hq_path), "d:/projects/postprocess/CATIS/workspace/gps_hq.bin");
    snprintf(config.aux_gps_lq_path, sizeof(config.aux_gps_lq_path), "d:/projects/postprocess/CATIS/workspace/gps_lq.bin");
    snprintf(config.aux_replica_path, sizeof(config.aux_replica_path), "d:/projects/postprocess/CATIS/workspace/replica.bin");
    snprintf(config.tm01_dir_name, sizeof(config.tm01_dir_name), "TM01");
    snprintf(config.tm02_dir_name, sizeof(config.tm02_dir_name), "TM02");

    void* handle = Catis_CreatePipeline(&config);
    if (!handle) {
        std::cerr << "Failed to create pipeline handle!" << std::endl;
        return -1;
    }

#if USE_POLLING
    // Catis_SetProgressCallback(handle, progress_callback);
    
    auto run_with_polling = [&](auto step_func, const std::string& step_name) {
        std::atomic<bool> running{true};
        std::thread poller([&]() {
            int progress = 0;
            int last_progress = -1;
            while(running) {
                Catis_GetProgress(handle, &progress);
                if (progress != last_progress) {
                    std::cout << "\r[PROGRESS " << progress << "%] " << step_name << " ..." << std::flush;
                    last_progress = progress;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(1000));
            }
            std::cout << std::endl;
        });

        int ret = step_func(handle);
        running = false;
        poller.join();
        return ret;
    };
#else
    Catis_SetProgressCallback(handle, progress_callback);
    auto run_with_polling = [&](auto step_func, const std::string& step_name) {
        return step_func(handle);
    };
#endif

    char report_buf[1024];

    auto print_duration = [](const std::string& step_name, auto start_time) {
        auto end_time = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time);
        std::cout << "[TIME] " << step_name << " took " << duration.count() / 1000.0 << " seconds." << std::endl;
    };

    // Step 1
    std::cout << "\n[Step 1] Extracting Payload..." << std::endl;
    auto t1 = std::chrono::high_resolution_clock::now();
    if (run_with_polling(Catis_ExtractPayload, "Extracting CADU") != CATIS_SUCCESS) {
        Catis_GetLastReport(handle, report_buf, sizeof(report_buf));
        std::cerr << "Step 1 Failed: " << report_buf << std::endl;
        Catis_DestroyPipeline(handle);
        return -1;
    }
    print_duration("Step 1 (Extract Payload)", t1);

    // Step 2 (Decryption - currently bypassed internally for testing)
    std::cout << "\n[Step 2] Decrypting Payload..." << std::endl;
    auto t2 = std::chrono::high_resolution_clock::now();
    if (run_with_polling(Catis_DecryptPayload, "Decrypting Payload") != CATIS_SUCCESS) {
        Catis_GetLastReport(handle, report_buf, sizeof(report_buf));
        std::cerr << "Step 2 Failed: " << report_buf << std::endl;
        Catis_DestroyPipeline(handle);
        return -1;
    }
    print_duration("Step 2 (Decrypt Payload)", t2);

    // Step 3 (Process Range Lines)
    std::cout << "\n[Step 3] Processing Range Lines..." << std::endl;
    auto t3 = std::chrono::high_resolution_clock::now();
    if (run_with_polling(Catis_ProcessRangeLines, "Process Range Lines") != CATIS_SUCCESS) {
        Catis_GetLastReport(handle, report_buf, sizeof(report_buf));
        std::cerr << "Step 3 Failed: " << report_buf << std::endl;
        Catis_DestroyPipeline(handle);
        return -1;
    }
    print_duration("Step 3 (Process Range Lines)", t3);

    // Step 4 (Export to HDF5)
    std::cout << "\n[Step 4] Exporting to HDF5..." << std::endl;
    auto t4 = std::chrono::high_resolution_clock::now();
    auto export_func = [](void* h) { return Catis_ExportHDF5(h, nullptr); };
    if (run_with_polling(export_func, "Export to HDF5") != CATIS_SUCCESS) {
        Catis_GetLastReport(handle, report_buf, sizeof(report_buf));
        std::cerr << "Step 4 Failed: " << report_buf << std::endl;
        Catis_DestroyPipeline(handle);
        return -1;
    }
    print_duration("Step 4 (Export HDF5)", t4);

    Catis_GetLastReport(handle, report_buf, sizeof(report_buf));
    std::cout << "\nPipeline completed successfully! Last Report:\n" << report_buf << std::endl;

    Catis_DestroyPipeline(handle);
    return 0;
}
