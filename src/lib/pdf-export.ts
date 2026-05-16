import type { OptimizedResume, InterviewQuestions } from '@/types';

const PRINT_STYLES = `
  @media print {
    @page { margin: 15mm 20mm; size: A4; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  @media screen {
    body { background: #f5f5f5; padding: 40px 20px; }
    .paper { max-width: 210mm; margin: 0 auto; background: #fff; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
  }
`;

function wrapPrintHTML(title: string, bodyContent: string, extraStyles: string = ''): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  ${PRINT_STYLES}
  ${extraStyles}
</style>
</head>
<body>
<div class="paper">
${bodyContent}
</div>
<script>(function(){if(window.location.search.includes('print=1')){setTimeout(function(){window.print()},500)}})()</script>
</body>
</html>`;
}

// Generate ATS-friendly plain text resume
export function generateATSResumeText(optimizedResume: OptimizedResume): string {
  return optimizedResume.optimized_resume;
}

// Generate HTML for pretty resume PDF
export function generatePrettyResumeHTML(optimizedResume: OptimizedResume, title: string, name: string): string {
  const lines = optimizedResume.optimized_resume.split('\n').filter((l) => l.trim());
  const bodyContent = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '<br/>';
      const sectionKeywords = ['教育', '经历', '技能', '项目', '关于', '联系', '工作', '实习', '证书', '语言'];
      const isHeader = sectionKeywords.some((kw) => trimmed.includes(kw)) && trimmed.length < 20;
      if (isHeader) {
        return `<h3 style="margin-top: 18px; margin-bottom: 8px; font-size: 14px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">${trimmed}</h3>`;
      }
      return `<p style="margin: 4px 0; line-height: 1.6; font-size: 12px; color: #334155;">${trimmed.replace(/•/g, '&bull;')}</p>`;
    })
    .join('\n');

  const content = `
    <div>
      <h1 style="font-size: 22px; margin-bottom: 4px;">${name}</h1>
      <h2 style="font-size: 14px; font-weight: 400; color: #64748b; margin-top: 0;">${title}</h2>
      ${bodyContent}
    </div>`;

  return wrapPrintHTML(title, content);
}

// Generate interview questions PDF HTML
export function generateInterviewQuestionsHTML(questions: InterviewQuestions): string {
  const questionsHTML = questions.questions
    .map(
      (q, i) => `
    <div style="margin-bottom: 20px; page-break-inside: avoid;">
      <h3 style="font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">问题 ${i + 1}. ${q.question}</h3>
      <div style="margin-left: 12px; font-size: 11px; color: #475569;">
        <p><strong>类型:</strong> ${q.type} | <strong>难度:</strong> ${q.difficulty} | <strong>风险:</strong> ${q.risk_level}</p>
        <p><strong>考察点:</strong> ${q.evaluation_point}</p>
        <p><strong>回答策略:</strong> ${q.answer_strategy}</p>
        ${q.pitfalls.length > 0 ? `<p><strong>注意事项:</strong> ${q.pitfalls.join('；')}</p>` : ''}
        ${q.materials_to_prepare.length > 0 ? `<p><strong>建议准备:</strong> ${q.materials_to_prepare.join('、')}</p>` : ''}
      </div>
    </div>`
    )
    .join('\n');

  const content = `
    <div>
      <h1 style="font-size: 18px; margin-bottom: 16px; border-bottom: 2px solid #1e293b; padding-bottom: 8px;">面试押题清单（${questions.questions.length} 题）</h1>
      ${questionsHTML}
    </div>`;

  return wrapPrintHTML('面试押题清单', content);
}

// Generate interview cheat sheet HTML
export function generateInterviewCheatSheetHTML(questions: InterviewQuestions): string {
  const itemsHTML = questions.questions
    .map(
      (q, i) => `
    <div style="margin-bottom: 10px; page-break-inside: avoid;">
      <p style="font-size: 11px; font-weight: 700; margin: 0;">${i + 1}. ${q.question}</p>
      <p style="font-size: 10px; color: #475569; margin: 2px 0 0 8px;"><strong>要点:</strong> ${q.answer_strategy.substring(0, 80)}${q.answer_strategy.length > 80 ? '...' : ''}</p>
      <p style="font-size: 10px; color: #64748b; margin: 0 0 0 8px;"><strong>准备:</strong> ${q.materials_to_prepare.join('、')}</p>
    </div>`
    )
    .join('\n');

  const content = `
    <div>
      <h1 style="font-size: 14px; margin-bottom: 10px;">面试押题 - 精简小抄（${questions.questions.length} 题）</h1>
      ${itemsHTML}
    </div>`;

  return wrapPrintHTML('面试押题-精简小抄', content);
}
