/**
 * Token Estimation and Formatting Utilities
 */

export function estimateTokens(text) {
  if (!text) return 0;
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  // Matches ~3.85 characters per token on mixed code, JSON schemas, and markdown rules
  return Math.max(1, Math.ceil(str.length / 3.85));
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
