//go:build !dll

package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const daemonPollInterval = 10 * time.Second

func main() {
	var cfgPath string
	flag.StringVar(&cfgPath, "config", "config.json", "path to config.json")
	flag.Parse()

	cfg, err := loadConfig(cfgPath)
	if err != nil {
		fatal(err)
	}
	applyDefaults(&cfg)

	if cfg.NASFinalDir == "" || cfg.NASTmpDir == "" {
		fatal(fmt.Errorf("nas_final_dir / nas_tmp_dir must be set"))
	}

	if err := os.MkdirAll(cfg.NASFinalDir, 0o755); err != nil {
		fatal(err)
	}
	if err := os.MkdirAll(cfg.NASTmpDir, 0o755); err != nil {
		fatal(err)
	}

	cleanupPartFiles(cfg.NASTmpDir)

	fmt.Println("[START] RawDataCollector (Go)")
	fmt.Printf("[CONF] FTP=%s:%d dir=%s | NAS=%s tmp=%s | lookback=%dd minAge=%dmin parallel=%d retry=%d\n",
		cfg.FTPHost, cfg.FTPPort, cfg.RemoteWatchDir, cfg.NASFinalDir, cfg.NASTmpDir,
		cfg.LookbackDays, cfg.MinAgeMinutes, cfg.MaxParallelDownloads, cfg.RetryMax)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		fmt.Println("[STOP] interrupt received -> cancel")
		cancel()
	}()

	// received.json은 시작 시 한 번만 로드
	receivedPath := cfgPathToReceived(cfgPath, cfg)
	idx, hadIdx, err := loadReceivedIndex(receivedPath)
	if err != nil {
		fmt.Println("[ERR] load received.json:", err)
		return
	}
	if !hadIdx {
		fmt.Println("[BOOTSTRAP] received.json missing -> build from NAS (recent only)")
		idx = bootstrapIndexFromNAS(cfg)
		_ = saveReceivedIndex(receivedPath, idx)
	}

	ticker := time.NewTicker(daemonPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			fmt.Println("[STOP] canceled, exiting main loop")
			return
		default:
		}

		if _, err := runOnce(ctx, cfg, idx, receivedPath); err != nil {
			fmt.Println("[ERR] runOnce:", err)
		}

		select {
		case <-ctx.Done():
			fmt.Println("[STOP] canceled, exiting main loop")
			return
		case <-ticker.C:
		}
	}
}
