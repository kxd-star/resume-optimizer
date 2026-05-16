import { NextRequest, NextResponse } from 'next/server';
import { getResultByTaskId } from '@/lib/db';
import {
  generateATSResumeText,
  generatePrettyResumeHTML,
  generateInterviewQuestionsHTML,
  generateInterviewCheatSheetHTML,
} from '@/lib/pdf-export';
import type { JDProfile, OptimizedResume, InterviewQuestions } from '@/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const body = await request.json();
    const exportType = body.type as string;

    const existingResult = await getResultByTaskId(taskId);
    if (!existingResult) {
      return NextResponse.json({ error: '分析结果不存在' }, { status: 404 });
    }

    const jdProfile: JDProfile = JSON.parse(existingResult.jd_profile);
    const optimizedResume: OptimizedResume = JSON.parse(existingResult.optimized_resume);
    const interviewQuestions: InterviewQuestions = JSON.parse(existingResult.interview_questions);
    const name = existingResult.resume_profile
      ? JSON.parse(existingResult.resume_profile).candidate_name || ''
      : '';

    let html: string;
    let filename: string;

    switch (exportType) {
      case 'resume_ats': {
        const text = generateATSResumeText(optimizedResume);
        return new NextResponse(text, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="${jdProfile.job_title}_简历_ATS版.txt"`,
          },
        });
      }
      case 'resume_pretty': {
        html = generatePrettyResumeHTML(optimizedResume, `${jdProfile.job_title} - 优化简历`, name);
        filename = `${jdProfile.job_title}_简历_美化版.html`;
        break;
      }
      case 'interview_questions_full': {
        html = generateInterviewQuestionsHTML(interviewQuestions);
        filename = `${jdProfile.job_title}_面试押题_完整版.html`;
        break;
      }
      case 'interview_questions_cheat': {
        html = generateInterviewCheatSheetHTML(interviewQuestions);
        filename = `${jdProfile.job_title}_面试押题_精简版.html`;
        break;
      }
      default: {
        html = generatePrettyResumeHTML(optimizedResume, `${jdProfile.job_title} - 优化简历`, name);
        filename = `${jdProfile.job_title}_简历_美化版.html`;
      }
    }

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '导出失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
