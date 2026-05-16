export interface ValidationError {
  field: string;
  message: string;
}

export function validateJDText(text: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!text || text.trim().length === 0) {
    errors.push({ field: 'jd_text', message: '请输入岗位 JD' });
  } else if (text.trim().length < 20) {
    errors.push({ field: 'jd_text', message: 'JD 内容过短，请补充完整的岗位描述和要求' });
  }
  return errors;
}

export function validateResumeText(text: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!text || text.trim().length === 0) {
    errors.push({ field: 'resume_text', message: '请输入简历内容' });
  } else if (text.trim().length < 20) {
    errors.push({ field: 'resume_text', message: '简历内容过短，请补充完整的工作经历和技能' });
  }
  return errors;
}

export function validateCreateAnalysisRequest(body: unknown): {
  valid: boolean;
  errors: ValidationError[];
  data?: { jd_text: string; resume_text: string; rewrite_mode: string; question_count: number };
} {
  const errors: ValidationError[] = [];
  const obj = body as Record<string, unknown>;

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: [{ field: 'body', message: '请求体不能为空' }] };
  }

  const jdErrors = validateJDText(obj.jd_text as string);
  errors.push(...jdErrors);

  const resumeErrors = validateResumeText(obj.resume_text as string);
  errors.push(...resumeErrors);

  const rewriteMode = (obj.rewrite_mode as string) || 'standard';
  if (!['conservative', 'standard', 'aggressive'].includes(rewriteMode)) {
    errors.push({ field: 'rewrite_mode', message: '优化模式无效，请选择 conservative/standard/aggressive' });
  }

  const questionCount = typeof obj.question_count === 'number' ? obj.question_count : 8;
  if (questionCount < 5 || questionCount > 20) {
    errors.push({ field: 'question_count', message: '面试题数量请在 5-20 之间' });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      jd_text: (obj.jd_text as string).trim(),
      resume_text: (obj.resume_text as string).trim(),
      rewrite_mode: rewriteMode,
      question_count: questionCount,
    },
  };
}

export function validateUpdateMatchRequest(body: unknown): {
  valid: boolean;
  errors: ValidationError[];
  edited_resume_text?: string;
} {
  const errors: ValidationError[] = [];
  const obj = body as Record<string, unknown>;

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: [{ field: 'body', message: '请求体不能为空' }] };
  }

  if (!obj.edited_resume_text || typeof obj.edited_resume_text !== 'string' || obj.edited_resume_text.trim().length === 0) {
    errors.push({ field: 'edited_resume_text', message: '编辑后的简历内容不能为空' });
  } else if (obj.edited_resume_text.trim().length < 20) {
    errors.push({ field: 'edited_resume_text', message: '简历内容过短' });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    edited_resume_text: (obj.edited_resume_text as string).trim(),
  };
}
