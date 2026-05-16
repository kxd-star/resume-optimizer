/**
 * Rule-based fact-checking for LLM-generated resume optimizations.
 * Verifies that no new concrete facts (numbers, companies, schools,
 * certifications) are introduced that didn't exist in the original.
 */

// Extract all numeric values from text (including percentages, ranges)
function extractNumbers(text: string): string[] {
  const results: string[] = [];
  // Matches: 1200w+, 800w, 3年, 90%, 20+, 4.5, [xxx]
  const patterns = [
    /\[?\d+[\.\d]*\s*[wW%年+]??\]?/g,
    /\d{3,}/g, // standalone 3+ digit numbers
  ];
  for (const p of patterns) {
    const matches = text.match(p);
    if (matches) results.push(...matches);
  }
  return [...new Set(results.map((s) => s.trim()))];
}

// Extract potential company/institution names (Chinese orgs usually 2-8 chars)
function extractOrgNames(text: string): string[] {
  // Look for known suffixes that indicate organizations
  const suffixPattern = /([一-鿿]{2,8}(?:公司|集团|大学|学院|研究院|研究所|银行|局|中心|平台|系统))/g;
  const matches = text.match(suffixPattern);
  return matches ? [...new Set(matches)] : [];
}

// Check if a number from the optimized version exists (or is close to) something in the original
function isNumberPlausible(optNum: string, origNums: string[]): boolean {
  const val = parseFloat(optNum.replace(/[wW+%\[\]]/g, ''));
  if (isNaN(val)) return false;
  // Check for exact match or close match
  return origNums.some((on) => {
    const ov = parseFloat(on.replace(/[wW+%\[\]]/g, ''));
    if (isNaN(ov)) return false;
    return Math.abs(val - ov) < 0.01; // exact or very close
  });
}

export interface FactCheckIssue {
  type: 'new_number' | 'new_organization' | 'new_credential' | 'escalated_claim';
  detail: string;
  severity: 'warning' | 'error';
}

const KNOWN_EDU_KEYWORDS = ['大学', '学院', '研究生', '博士', '硕士', '本科', '学历'];

export function verifyOptimizedResume(
  originalText: string,
  optimizedText: string
): FactCheckIssue[] {
  const issues: FactCheckIssue[] = [];
  const origLower = originalText.toLowerCase();

  // 1. Number check — don't allow new metrics
  const origNums = extractNumbers(originalText);
  const optNums = extractNumbers(optimizedText);

  // Also check numbers in [placeholder] format — these are OK (marked as uncertain)
  const placeholders = optimizedText.match(/\[待补充\]|\[placeholder\]|\[.*?\]/gi) || [];

  for (const num of optNums) {
    // Skip numbers in known placeholder brackets
    if (placeholders.some((p) => p.includes(num))) continue;
    // Skip years (4-digit numbers)
    const val = parseFloat(num.replace(/[wW+%\[\]]/g, ''));
    if (!isNaN(val) && val > 1900 && val < 2100) continue;
    // Check if plausible
    if (!isNumberPlausible(num, origNums)) {
      // Check if it's in the original text as-is
      if (!origLower.includes(num.toLowerCase())) {
        issues.push({
          type: 'new_number',
          detail: `优化版本出现了原文没有的数据: "${num}"`,
          severity: 'warning',
        });
      }
    }
  }

  // 2. Organization check
  const origOrgs = extractOrgNames(originalText);
  const optOrgs = extractOrgNames(optimizedText);

  for (const org of optOrgs) {
    if (!origOrgs.includes(org) && !origLower.includes(org.toLowerCase())) {
      issues.push({
        type: 'new_organization',
        detail: `优化版本出现了原文没有的组织名称: "${org}"`,
        severity: 'error',
      });
    }
  }

  // 3. Education/credential check
  for (const kw of KNOWN_EDU_KEYWORDS) {
    const origIdx = origLower.indexOf(kw);
    if (origIdx === -1) {
      // Check if optimized text newly introduces education keywords
      const optIdx = optimizedText.indexOf(kw);
      if (optIdx !== -1) {
        // Extract the context around the keyword
        const start = Math.max(0, optIdx - 20);
        const end = Math.min(optimizedText.length, optIdx + 20);
        const context = optimizedText.slice(start, end);
        issues.push({
          type: 'new_credential',
          detail: `原文未提及学历信息，优化版本新增: "...${context}..."`,
          severity: 'error',
        });
      }
    }
  }

  return issues;
}

export function formatFactCheckWarning(issues: FactCheckIssue[]): string {
  if (issues.length === 0) return '';
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const parts: string[] = [];
  if (errors.length > 0) {
    parts.push(`⚠️ 以下信息原文未找到，请确认未虚构：\n${errors.map((e) => `  - ${e.detail}`).join('\n')}`);
  }
  if (warnings.length > 0) {
    parts.push(`💡 以下数据原文未直接出现，建议核实：\n${warnings.map((e) => `  - ${e.detail}`).join('\n')}`);
  }
  return parts.join('\n\n');
}
