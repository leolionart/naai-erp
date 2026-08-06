"use client";

export default function ExecutiveTrendChart({ points }: { points: readonly number[] }) {
  const max = Math.max(...points.map((point) => Math.abs(point)), 1);
  const path = points
    .map(
      (point, index) =>
        `${(index / Math.max(points.length - 1, 1)) * 100},${50 - (point / max) * 40}`,
    )
    .join(" ");
  return (
    <div className="h-48 w-full" role="img" aria-label="Xu hướng doanh thu theo kỳ từ API">
      <svg className="size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          points={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
