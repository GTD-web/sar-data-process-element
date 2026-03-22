"""CSC03 range compression — Algorithm Layer placeholder (SDPE-CDS-001)."""


class AlgorithmError(Exception):
    """Raised when algorithm inputs or state are invalid."""


class RangeCompressionAlgorithm:
    """Placeholder SAR range-compression processor."""

    def run(self, sample_scale: float) -> float:
        """Scale sample (placeholder implementation)."""
        if sample_scale < 0.0:
            raise AlgorithmError("sample_scale must be non-negative")
        return sample_scale * 1.0
