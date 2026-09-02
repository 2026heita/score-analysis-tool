# Integration test runner using TypeScript loader
$ErrorActionPreference = "Stop"

Write-Host "=== Integration Tests (TypeScript Loader) ===" -ForegroundColor Cyan
Write-Host ""

# Test files
$tests = @(
    "tests/integration/safeFormat.test.ts",
    "tests/integration/numericParser.test.ts",
    "tests/integration/dateParsing.test.ts",
    "tests/integration/stage0A1.test.ts",
    "tests/integration/stage0A2.test.ts",
    "tests/integration/stage1A1.test.ts",
    "tests/integration/sampleData.test.ts",
    "tests/integration/acceptanceRound3.test.ts",
    "tests/integration/asyncRace.test.ts",
    "tests/integration/fieldWiring.test.ts",
    "tests/integration/fieldConsumer.test.ts",
    "tests/integration/genericVsLegacy.test.ts",
    "tests/integration/legacyBoundary.test.ts"
)

$totalPassed = 0
$totalFailed = 0

foreach ($test in $tests) {
    if (Test-Path $test) {
        Write-Host "Running: $test" -ForegroundColor Yellow
        node --experimental-loader ./tests/ts-loader-hooks.mjs $test
        if ($LASTEXITCODE -ne 0) {
            $totalFailed++
            Write-Host "FAIL: $test" -ForegroundColor Red
        } else {
            $totalPassed++
            Write-Host "PASS: $test" -ForegroundColor Green
        }
        Write-Host ""
    } else {
        Write-Host "WARN: $test not found" -ForegroundColor Yellow
    }
}

Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Passed: $totalPassed" -ForegroundColor Green
Write-Host "Failed: $totalFailed" -ForegroundColor $(if ($totalFailed -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($totalFailed -gt 0) {
    exit 1
}
