"use client";

export function RetryButton() {
  return <button className="btn mt-6" onClick={() => window.location.reload()}>Try again</button>;
}
