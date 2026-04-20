// RawDataCollector DLL - C# 호출 예제
// .NET 6+ 또는 .NET Framework 4.7+

using System;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

// ── DLL P/Invoke 래퍼 ──────────────────────────────────────────────────────────
public static class RawDataCollector
{
    // CallingConvention.Cdecl: Go DLL 기본 호출 규약
    // CharSet.Ansi: UTF-8 char* 매핑
    [DllImport("RawDataCollector.dll",
        CallingConvention = CallingConvention.Cdecl,
        CharSet = CharSet.Ansi)]
    private static extern IntPtr FetchRawData(string configPath);

    public record Result(
        [property: JsonPropertyName("ok")]         bool     Ok,
        [property: JsonPropertyName("downloaded")] int      Downloaded,
        [property: JsonPropertyName("errors")]     string[] Errors
    );

    /// <summary>
    /// FTP 수집을 1회 실행한다.
    /// 반환된 IntPtr은 DLL 내부 정적 버퍼를 가리키므로 Marshal.FreeHGlobal 불필요.
    /// Marshal.PtrToStringAnsi가 내부적으로 복사본을 생성한다.
    /// </summary>
    public static Result Fetch(string configPath)
    {
        IntPtr ptr = FetchRawData(configPath);

        // PtrToStringAnsi: C char* → C# string (복사본, DLL 버퍼와 독립적)
        string json = Marshal.PtrToStringAnsi(ptr)
            ?? throw new InvalidOperationException("DLL returned null");

        return JsonSerializer.Deserialize<Result>(json)
            ?? throw new InvalidOperationException("Failed to parse DLL response");
    }
}

// ── 사용 예시 ──────────────────────────────────────────────────────────────────
class Program
{
    static int Main(string[] args)
    {
        string configPath = args.Length > 0 ? args[0] : "config.json";

        var result = RawDataCollector.Fetch(configPath);

        if (result.Ok)
        {
            Console.WriteLine($"[OK] downloaded={result.Downloaded}");
            return 0;
        }
        else
        {
            Console.Error.WriteLine($"[FAIL] downloaded={result.Downloaded}");
            foreach (var err in result.Errors)
                Console.Error.WriteLine($"  - {err}");
            return 1;
        }
    }
}
