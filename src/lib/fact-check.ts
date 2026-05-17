/**
 * Rule-based fact checking for LLM-generated resume optimizations.
 * High precision is more important than recall here: noisy warnings reduce trust.
 */

function extractNumbers(text: string): string[] {
  const matches = text.match(/\[?\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?\s*(?:%|w|W|万|亿|人|家|台|个|年|月|次|场|\+)?\]?/g);
  return matches ? [...new Set(matches.map((s) => s.trim()))] : [];
}

function extractOrgNames(text: string): string[] {
  const suffixes = '(?:有限公司|有限责任公司|集团|大学|学院|研究院|研究所|银行|证券|基金|保险|科技公司|软件公司)';
  const matches = text.match(new RegExp(`[\\u4e00-\\u9fa5A-Za-z0-9]{2,24}${suffixes}`, 'g'));
  return matches ? [...new Set(matches)] : [];
}

function normalizeNumber(value: string): number | null {
  const cleaned = value.replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned.split('-')[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPlaceholder(text: string, num: string): boolean {
  const idx = text.indexOf(num);
  if (idx === -1) return false;
  const left = text.lastIndexOf('[', idx);
  const right = text.indexOf(']', idx);
  return left !== -1 && right !== -1 && left < idx && idx < right;
}

function isNumberPlausible(optNum: string, origNums: string[]): boolean {
  const val = normalizeNumber(optNum);
  if (val === null) return false;
  return origNums.some((original) => {
    const originalVal = normalizeNumber(original);
    return originalVal !== null && Math.abs(val - originalVal) < 0.01;
  });
}

export interface FactCheckIssue {
  type: 'new_number' | 'new_organization' | 'new_credential' | 'escalated_claim';
  detail: string;
  severity: 'warning' | 'error';
}

const CREDENTIAL_KEYWORDS = ['博士', '硕士', '本科', 'MBA', 'PMP', 'CPA', '证书', '认证'];

export function verifyOptimizedResume(
  originalText: string,
  optimizedText: string
): FactCheckIssue[] {
  const issues: FactCheckIssue[] = [];
  const originalLower = originalText.toLowerCase();
  const originalNumbers = extractNumbers(originalText);

  for (const num of extractNumbers(optimizedText)) {
    if (isPlaceholder(optimizedText, num)) continue;
    const val = normalizeNumber(num);
    if (val !== null && val > 1900 && val < 2100) continue;
    if (!originalLower.includes(num.toLowerCase()) && !isNumberPlausible(num, originalNumbers)) {
      issues.push({
        type: 'new_number',
        detail: `优化版本出现原文未找到的数据：${num}`,
        severity: 'warning',
      });
    }
  }

  const originalOrgs = extractOrgNames(originalText);
  for (const org of extractOrgNames(optimizedText)) {
    if (!originalOrgs.includes(org) && !originalLower.includes(org.toLowerCase())) {
      issues.push({
        type: 'new_organization',
        detail: `优化版本出现原文未找到的组织名称：${org}`,
        severity: 'error',
      });
    }
  }

  for (const keyword of CREDENTIAL_KEYWORDS) {
    if (!originalText.includes(keyword) && optimizedText.includes(keyword)) {
      issues.push({
        type: 'new_credential',
        detail: `优化版本新增了原文未明确出现的学历/证书关键词：${keyword}`,
        severity: 'warning',
      });
    }
  }

  return issues;
}

export function formatFactCheckWarning(issues: FactCheckIssue[]): string {
  if (issues.length === 0) return '';
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const parts: string[] = [];

  if (errors.length > 0) {
    parts.push(`以下信息在原文中未找到，请确认未虚构：\n${errors.map((issue) => `- ${issue.detail}`).join('\n')}`);
  }
  if (warnings.length > 0) {
    parts.push(`以下信息建议核实后再使用：\n${warnings.map((issue) => `- ${issue.detail}`).join('\n')}`);
  }
  return parts.join('\n\n');
}
