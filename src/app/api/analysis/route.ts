import { NextRequest, NextResponse } from 'next/server';
import { createAnalysisTask } from '@/lib/task-manager';
import { validateCreateAnalysisRequest } from '@/lib/validation';
import type { CreateAnalysisRequest, CreateAnalysisResponse, RewriteMode } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: CreateAnalysisRequest = await request.json();
    const validation = validateCreateAnalysisRequest(body);

    if (!validation.valid || !validation.data) {
      return NextResponse.json(
        { error: '请求参数验证失败', details: validation.errors },
        { status: 400 }
      );
    }

    const { jd_text, resume_text, rewrite_mode, question_count } = validation.data;

    const taskId = await createAnalysisTask({
      jd_text,
      resume_text,
      rewrite_mode: rewrite_mode as RewriteMode,
      question_count,
      client_session_id: body.client_session_id,
    });

    const response: CreateAnalysisResponse = {
      task_id: taskId,
      status: 'running',
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建分析任务失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
